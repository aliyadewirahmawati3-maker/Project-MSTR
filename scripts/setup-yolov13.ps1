$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$weightsDirectory = Join-Path $projectRoot 'models\yolov13'
$weightsPath = Join-Path $weightsDirectory 'yolov13n.pt'
$expectedDigest = '6653035017b0f111f80ec11ed914874ea85699b104aeac1e46e517d16889d6b7'
$officialUrl = 'https://github.com/iMoonLab/yolov13/releases/download/yolov13/yolov13n.pt'
New-Item -ItemType Directory -Force -Path $weightsDirectory | Out-Null
if ((Test-Path -LiteralPath $weightsPath) -and ((Get-FileHash -LiteralPath $weightsPath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $expectedDigest)) {
    Write-Output "Weights resmi sudah terverifikasi: $weightsPath"
    exit 0
}
$downloadPath = Join-Path $weightsDirectory 'yolov13n.pt.download'
Invoke-WebRequest -UseBasicParsing -Uri $officialUrl -OutFile $downloadPath
if ((Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedDigest) {
    throw 'SHA256 weights tidak cocok dengan digest release resmi. File tidak diaktifkan.'
}
Move-Item -LiteralPath $downloadPath -Destination $weightsPath -Force
Write-Output "Weights resmi terverifikasi: $weightsPath"
