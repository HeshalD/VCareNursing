# Temporary WhatsApp API Test Script
# DELETE THIS FILE after testing — it contains your access token

$ACCESS_TOKEN    = "EAANXbL1kTfgBRqpehVz2G5hlYGbVtjHuiaK5onOoe7B1ZCSvd566uySL0t53kgESZA3XuXaL8qwbSZAoTuQIXhoSJjHDvTVoAWZC6XKg50wPY1QKVRrsCY3pQPaugSrZAb2PGyB61Na7jZAiHViZBlfLGEBZAJos5eabpH1Vx6CZCBRZAGZCvAJlbmzUbcbGZB2XTF4hZCAZDZD"
$PHONE_NUMBER_ID = "1175317915664611"
$TO_PHONE        = "94767895024"
$MESSAGE         = "Hello! This is a test message from VCare Nursing."

$json = '{"messaging_product":"whatsapp","recipient_type":"individual","to":"' + $TO_PHONE + '","type":"text","text":{"body":"' + $MESSAGE + '"}}'

$tmpFile = "$env:TEMP\wa_payload.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($tmpFile, $json, $utf8NoBom)

Write-Host ""
Write-Host "Endpoint: https://graph.facebook.com/v23.0/$PHONE_NUMBER_ID/messages"
Write-Host "Payload:  $json"
Write-Host ""

$result = curl.exe --silent --show-error --include `
    --request POST `
    --url "https://graph.facebook.com/v23.0/$PHONE_NUMBER_ID/messages" `
    --header "Authorization: Bearer $ACCESS_TOKEN" `
    --header "Content-Type: application/json" `
    --data "@$tmpFile"

Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue

Write-Host "--- Response ---"
Write-Host $result
Write-Host "----------------"
