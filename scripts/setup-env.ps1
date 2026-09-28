$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

foreach ($relativePath in @('.env', 'backend/.env')) {
    $envPath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $envPath)) {
        Copy-Item -LiteralPath "$envPath.example" -Destination $envPath
        Write-Output "Created $relativePath from its example."
    }
}

$rootEnvPath = Join-Path $projectRoot '.env'
$rootContent = [System.IO.File]::ReadAllText($rootEnvPath)
$keyMatch = [regex]::Match($rootContent, '(?m)^APP_KEY=([^\r\n]*)')
$appKey = $keyMatch.Groups[1].Value.Trim()

# Preserve existing keys; replace only missing keys and the old example value.
if (-not $appKey -or $appKey.Contains('SIGAP_EXAMPLE_SECRET_KEY_PLACEHOLDER')) {
    $keyBytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($keyBytes) } finally { $generator.Dispose() }
    $appKey = 'base64:' + [Convert]::ToBase64String($keyBytes)
    if ($keyMatch.Success) {
        $rootContent = [regex]::Replace($rootContent, '(?m)^APP_KEY=[^\r\n]*', "APP_KEY=$appKey")
    } else {
        $rootContent += "`nAPP_KEY=$appKey`n"
    }
    [System.IO.File]::WriteAllText($rootEnvPath, $rootContent, $utf8)
    Write-Output 'Generated local APP_KEY (value hidden).'
}

$backendEnvPath = Join-Path $projectRoot 'backend/.env'
$backendContent = [System.IO.File]::ReadAllText($backendEnvPath)
$backendKey = [regex]::Match($backendContent, '(?m)^APP_KEY=([^\r\n]*)')
if (-not $backendKey.Groups[1].Value.Trim() -or $backendKey.Groups[1].Value.Contains('SIGAP_EXAMPLE_SECRET_KEY_PLACEHOLDER')) {
    if ($backendKey.Success) {
        $backendContent = [regex]::Replace($backendContent, '(?m)^APP_KEY=[^\r\n]*', "APP_KEY=$appKey")
    } else {
        $backendContent += "`nAPP_KEY=$appKey`n"
    }
    [System.IO.File]::WriteAllText($backendEnvPath, $backendContent, $utf8)
}

Write-Output 'Local environment ready. Compose uses the root .env; existing configuration is preserved.'
