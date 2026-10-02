<?php
// Receives the website enquiry form (JSON POST) and emails it to the company.
// Hardening: same-origin check, honeypot, minimum fill time, per-IP rate limit,
// strict validation, and no user input in mail headers except a validated Reply-To.

const TO_ADDRESS   = 'info@padl.co.zm';
const SUBJECT_TAG  = '[Website enquiry]';
const MIN_SECONDS  = 3;     // faster than this = bot
const MAX_PER_HOUR = 5;     // per IP

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out($code, $ok, $msg = '') {
    http_response_code($code);
    echo json_encode(['ok' => $ok, 'error' => $msg]);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, false, 'Method not allowed');

// Same-origin only
$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $oh = strtolower((string) parse_url($origin, PHP_URL_HOST));
    $hh = strtolower(preg_replace('/:\d+$/', '', $host));
    if ($oh !== $hh) out(403, false, 'Forbidden');
}

$raw = file_get_contents('php://input', false, null, 0, 20000);
$d = json_decode((string) $raw, true);
if (!is_array($d)) out(400, false, 'Invalid request');

// Honeypot and timing: pretend success so bots learn nothing
if (!empty($d['website'])) out(200, true);
$elapsed = (int) ($d['elapsed'] ?? 0);
if ($elapsed < MIN_SECONDS * 1000) out(200, true);

// Rate limit per IP
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$file = sys_get_temp_dir() . '/pad_enq_' . md5($ip);
$hits = [];
if (is_file($file)) {
    $hits = array_filter(array_map('intval', (array) file($file, FILE_IGNORE_NEW_LINES)), function ($t) { return $t > time() - 3600; });
}
if (count($hits) >= MAX_PER_HOUR) out(429, false, 'Too many enquiries, please try again later.');

function clean($v, $max) {
    $v = is_string($v) ? $v : '';
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $v); // control chars (keeps \n \t)
    return trim(mb_substr($v, 0, $max));
}
$name    = clean($d['name'] ?? '', 120);
$company = clean($d['company'] ?? '', 120);
$email   = clean($d['email'] ?? '', 160);
$phone   = clean($d['phone'] ?? '', 40);
$message = clean($d['message'] ?? '', 5000);
$oneLine = function ($s) { return preg_replace('/\s+/', ' ', $s); };
$name = $oneLine($name); $company = $oneLine($company); $phone = $oneLine($phone);

if (mb_strlen($name) < 2 || mb_strlen($message) < 10 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    out(422, false, 'Please check the form and try again.');
}

$domain = preg_replace('/^www\./', '', preg_replace('/:\d+$/', '', $host));
if (!preg_match('/^[a-z0-9.-]+$/', $domain)) $domain = 'padl.co.zm';

$body = "New enquiry from the website\n\n"
      . "Name:    $name\n"
      . "Company: $company\n"
      . "Email:   $email\n"
      . "Phone:   $phone\n\n"
      . "Message:\n$message\n\n"
      . "--\nSent from $domain at " . gmdate('Y-m-d H:i') . " UTC (IP $ip)\n";

$headers = [
    'From: Website <no-reply@' . $domain . '>',
    'Reply-To: ' . $email,
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: PAD-website',
];
$subject = '=?UTF-8?B?' . base64_encode(SUBJECT_TAG . ' ' . $name) . '?=';

$sent = @mail(TO_ADDRESS, $subject, $body, implode("\r\n", $headers));
if (!$sent) out(500, false, 'Could not send the message.');

$hits[] = time();
@file_put_contents($file, implode("\n", $hits), LOCK_EX);
out(200, true);
