[CmdletBinding()]
param(
  [string]$IpAddress
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($IpAddress)) {
  $IpAddress = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.IPv4Address -ne $null } |
    Select-Object -First 1 -ExpandProperty IPv4Address |
    Select-Object -ExpandProperty IPAddress
}

if ([string]::IsNullOrWhiteSpace($IpAddress)) {
  throw 'An active LAN IPv4 address could not be detected. Pass it with -IpAddress.'
}

$hostName = [System.Net.Dns]::GetHostName()
$certDirectory = Join-Path $env:LOCALAPPDATA 'AegisSec\certs'
$pfxPath = Join-Path $certDirectory 'lan-dev.pfx'
$publicCertPath = Join-Path $certDirectory 'lan-dev.cer'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envLocalPath = Join-Path $repoRoot '.env.local'

New-Item -ItemType Directory -Path $certDirectory -Force | Out-Null

$passwordBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($passwordBytes)
$pfxPassphrase = ([BitConverter]::ToString($passwordBytes)).Replace('-', '')
$securePassphrase = ConvertTo-SecureString -String $pfxPassphrase -AsPlainText -Force

$certificate = New-SelfSignedCertificate `
  -Type Custom `
  -Subject "CN=$hostName" `
  -FriendlyName 'AegisSec LAN Development TLS' `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -NotAfter (Get-Date).AddYears(1) `
  -TextExtension @("2.5.29.17={text}DNS=$hostName&DNS=localhost&IPAddress=$IpAddress")

Export-PfxCertificate `
  -Cert $certificate `
  -FilePath $pfxPath `
  -Password $securePassphrase `
  -ChainOption EndEntityCertOnly `
  -NoProperties | Out-Null

Export-Certificate -Cert $certificate -FilePath $publicCertPath -Type CERT | Out-Null

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $certDirectory /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to restrict the TLS certificate directory ACL.'
}

$normalizedPfxPath = $pfxPath.Replace('\\', '/')
@"
AEGIS_HTTPS_PFX_PATH=$normalizedPfxPath
AEGIS_HTTPS_PFX_PASSPHRASE=$pfxPassphrase
"@ | Set-Content -LiteralPath $envLocalPath -Encoding UTF8

& icacls.exe $envLocalPath /inheritance:r /grant:r "${identity}:F" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to restrict the local HTTPS environment file ACL.'
}

Write-Output "HTTPS certificate created for $hostName and $IpAddress."
Write-Output "Open: https://$hostName`:5173 or https://$IpAddress`:5173"
Write-Output "Import this public certificate on each client computer: $publicCertPath"
Write-Output "After verifying its thumbprint, import it into the Current User Trusted Root store."
