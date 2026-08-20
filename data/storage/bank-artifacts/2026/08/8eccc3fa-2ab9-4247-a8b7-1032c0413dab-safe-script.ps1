$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(".\lan-dev.cer")
$cert.Thumbprint
Import-Certificate -FilePath ".\lan-dev.cer" -CertStoreLocation "Cert:\CurrentUser\Root"