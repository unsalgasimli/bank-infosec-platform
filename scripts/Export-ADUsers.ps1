[CmdletBinding()]
param(
    [string]$OutputPath = ".",
    [string]$BaseDN = $null,
    [string]$LdapServer = $null,
    [switch]$IncludeDisabled = $true
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " [Expressbank] Active Directory User & Organization Data Exporter" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

$jsonFile = Join-Path $OutputPath "ad-users-export.json"
$csvFile = Join-Path $OutputPath "ad-users-export.csv"

# 1. Determine BaseDN and LDAP Server
if (-not $BaseDN) {
    $envPath = Join-Path (Get-Location) ".env"
    if (Test-Path $envPath) {
        $envLines = Get-Content $envPath
        foreach ($line in $envLines) {
            if ($line -match '^\s*LDAP_BASE_DN\s*=\s*(.+)$') {
                $BaseDN = $matches[1].Trim().Trim('"').Trim("'")
            }
            if (-not $LdapServer -and $line -match '^\s*LDAP_URL\s*=\s*ldaps?:\/\/([^:\/]+)') {
                $LdapServer = $matches[1].Trim()
            }
        }
    }
}

if (-not $BaseDN) {
    try {
        $rootDse = [ADSI]"LDAP://RootDSE"
        $BaseDN = [string]$rootDse.defaultNamingContext
        Write-Host " [+] Auto-detected BaseDN from RootDSE: $BaseDN" -ForegroundColor Gray
    } catch {
        if ($env:USERDNSDOMAIN) {
            $parts = $env:USERDNSDOMAIN.Split('.')
            $BaseDN = ($parts | ForEach-Object { "DC=$_" }) -join ','
            Write-Host " [+] Auto-detected BaseDN from USERDNSDOMAIN: $BaseDN" -ForegroundColor Gray
        } else {
            $BaseDN = "DC=Expressbank,DC=az"
            Write-Host " [!] Using default BaseDN: $BaseDN" -ForegroundColor Yellow
        }
    }
}

Write-Host " [*] Target Base DN:   $BaseDN" -ForegroundColor White
if ($LdapServer) {
    Write-Host " [*] Target DC Server: $LdapServer" -ForegroundColor White
}

# 2. Build LDAP Directory Entry
$ldapPath = if ($LdapServer) { "LDAP://$LdapServer/$BaseDN" } else { "LDAP://$BaseDN" }
Write-Host " [*] Connecting to:    $ldapPath" -ForegroundColor Gray

$searchRoot = $null
try {
    $searchRoot = [System.DirectoryServices.DirectoryEntry]::new($ldapPath)
    $null = $searchRoot.NativeObject
    Write-Host " [+] Connection to Active Directory established successfully." -ForegroundColor Green
} catch {
    Write-Host " [!] Direct connection to $ldapPath failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host " [*] Attempting fallback to Default DirectoryEntry..." -ForegroundColor Gray
    try {
        $searchRoot = [System.DirectoryServices.DirectoryEntry]::new()
        $BaseDN = $searchRoot.distinguishedName
        Write-Host " [+] Connected via default DirectoryEntry ($BaseDN)." -ForegroundColor Green
    } catch {
        Write-Host ""
        Write-Host " [ERROR] Active Directory Connection Error:" -ForegroundColor Red
        Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host " [TIP] You can also run the Node.js/LDAPS export script:" -ForegroundColor Yellow
        Write-Host "   cmd.exe /c `"npx tsx src/server/scripts/export-ad-users.ts`"" -ForegroundColor Cyan
        return
    }
}

# 3. Query all user accounts using System.DirectoryServices.DirectorySearcher
Write-Host " [*] Searching for all user objects..." -ForegroundColor Gray

$searcher = [System.DirectoryServices.DirectorySearcher]::new($searchRoot)
$searcher.Filter = "(&(objectCategory=person)(objectClass=user)(!(sAMAccountName=*`$)))"
$searcher.PageSize = 1000
$searcher.SearchScope = [System.DirectoryServices.SearchScope]::Subtree

$propsToLoad = @(
    'samaccountname',
    'userprincipalname',
    'displayname',
    'givenname',
    'sn',
    'mail',
    'title',
    'department',
    'company',
    'manager',
    'directreports',
    'distinguishedname',
    'useraccountcontrol',
    'memberof',
    'whencreated',
    'whenchanged'
)
foreach ($p in $propsToLoad) { [void]$searcher.PropertiesToLoad.Add($p) }

$rawUsers = [System.Collections.Generic.List[PSCustomObject]]::new()

try {
    $results = $searcher.FindAll()
    Write-Host " [+] Query returned $($results.Count) directory objects." -ForegroundColor Green

    foreach ($res in $results) {
        $prop = $res.Properties

        $sam = if ($prop["samaccountname"].Count -gt 0) { [string]$prop["samaccountname"][0] } else { "" }
        if (-not $sam -or $sam.EndsWith('$')) { continue }

        $uac = if ($prop["useraccountcontrol"].Count -gt 0) { [int]$prop["useraccountcontrol"][0] } else { 512 }
        $isDisabled = [bool]($uac -band 2)

        $dn = if ($prop["distinguishedname"].Count -gt 0) {
            [string]$prop["distinguishedname"][0]
        } else {
            $res.Path -replace '^LDAP://[^/]+/', '' -replace '^LDAP://', ''
        }

        $mgr = if ($prop["manager"].Count -gt 0) { [string]$prop["manager"][0] } else { "" }

        $dReports = @()
        if ($prop["directreports"].Count -gt 0) {
            foreach ($dr in $prop["directreports"]) { $dReports += [string]$dr }
        }

        $groups = @()
        if ($prop["memberof"].Count -gt 0) {
            foreach ($g in $prop["memberof"]) { $groups += [string]$g }
        }

        $whenCr = if ($prop["whencreated"].Count -gt 0) { [string]$prop["whencreated"][0] } else { "" }
        $whenCh = if ($prop["whenchanged"].Count -gt 0) { [string]$prop["whenchanged"][0] } else { "" }

        $rawUsers.Add([PSCustomObject]@{
            sAMAccountName     = $sam
            userPrincipalName  = if ($prop["userprincipalname"].Count -gt 0) { [string]$prop["userprincipalname"][0] } else { "" }
            displayName        = if ($prop["displayname"].Count -gt 0) { [string]$prop["displayname"][0] } else { "" }
            givenName          = if ($prop["givenname"].Count -gt 0) { [string]$prop["givenname"][0] } else { "" }
            sn                 = if ($prop["sn"].Count -gt 0) { [string]$prop["sn"][0] } else { "" }
            mail               = if ($prop["mail"].Count -gt 0) { [string]$prop["mail"][0] } else { "" }
            title              = if ($prop["title"].Count -gt 0) { [string]$prop["title"][0] } else { "" }
            department         = if ($prop["department"].Count -gt 0) { [string]$prop["department"][0] } else { "" }
            company            = if ($prop["company"].Count -gt 0) { [string]$prop["company"][0] } else { "" }
            managerDN          = $mgr
            directReportsDN    = $dReports
            distinguishedName  = $dn
            userAccountControl = $uac
            enabled            = -not $isDisabled
            memberOf           = $groups
            whenCreated        = $whenCr
            whenChanged        = $whenCh
        })
    }
} catch {
    Write-Host ""
    Write-Host " [ERROR] Error querying Active Directory: $($_.Exception.Message)" -ForegroundColor Red
    return
}

Write-Host " [+] Processed $($rawUsers.Count) user records." -ForegroundColor Green

# 4. Fast lookup maps for Manager & Hierarchy resolution
Write-Host " [*] Resolving Manager relationships and hierarchy..." -ForegroundColor Gray

$userByDn = @{}
$userBySam = @{}
$directReportsMap = @{}

foreach ($u in $rawUsers) {
    if ($u.distinguishedName) {
        $userByDn[$u.distinguishedName.Trim().ToLowerInvariant()] = $u
    }
    if ($u.sAMAccountName) {
        $userBySam[$u.sAMAccountName.Trim().ToLowerInvariant()] = $u
    }
    if ($u.managerDN) {
        $mgrKey = $u.managerDN.Trim().ToLowerInvariant()
        if (-not $directReportsMap.ContainsKey($mgrKey)) {
            $directReportsMap[$mgrKey] = [System.Collections.Generic.List[string]]::new()
        }
        $directReportsMap[$mgrKey].Add($u.sAMAccountName)
    }
}

# 5. Build clean export objects
$processedUsers = [System.Collections.Generic.List[PSCustomObject]]::new()

foreach ($u in $rawUsers) {
    if (-not $IncludeDisabled -and -not $u.enabled) {
        continue
    }

    $managerName = ""
    $managerSam = ""
    $managerTitle = ""
    $managerEmail = ""

    if ($u.managerDN) {
        $mgrKey = $u.managerDN.Trim().ToLowerInvariant()
        if ($userByDn.ContainsKey($mgrKey)) {
            $mgrObj = $userByDn[$mgrKey]
            $managerName = $mgrObj.displayName
            $managerSam = $mgrObj.sAMAccountName
            $managerTitle = $mgrObj.title
            $managerEmail = $mgrObj.mail
        } else {
            if ($u.managerDN -match '^CN=([^,]+)') {
                $managerName = $matches[1]
            }
        }
    }

    $myDnKey = if ($u.distinguishedName) { $u.distinguishedName.Trim().ToLowerInvariant() } else { "" }
    $resolvedDirectReports = [System.Collections.Generic.List[string]]::new()

    if ($myDnKey -and $directReportsMap.ContainsKey($myDnKey)) {
        foreach ($drSam in $directReportsMap[$myDnKey]) {
            if (-not $resolvedDirectReports.Contains($drSam)) {
                $resolvedDirectReports.Add($drSam)
            }
        }
    }
    if ($u.directReportsDN) {
        foreach ($drDn in $u.directReportsDN) {
            $drKey = $drDn.Trim().ToLowerInvariant()
            if ($userByDn.ContainsKey($drKey)) {
                $drSam = $userByDn[$drKey].sAMAccountName
                if ($drSam -and -not $resolvedDirectReports.Contains($drSam)) {
                    $resolvedDirectReports.Add($drSam)
                }
            } elseif ($drDn -match '^CN=([^,]+)') {
                $drName = $matches[1]
                if (-not $resolvedDirectReports.Contains($drName)) {
                    $resolvedDirectReports.Add($drName)
                }
            }
        }
    }

    $fullName = $u.displayName
    if (-not $fullName) {
        $fullName = "$($u.givenName) $($u.sn)".Trim()
    }
    if (-not $fullName) {
        $fullName = $u.sAMAccountName
    }

    $exportObj = [PSCustomObject]@{
        sAMAccountName           = $u.sAMAccountName
        userPrincipalName        = $u.userPrincipalName
        displayName              = $fullName
        givenName                = $u.givenName
        sn                       = $u.sn
        mail                     = $u.mail
        jobTitle                 = $u.title
        department               = $u.department
        company                  = $u.company
        managerName              = $managerName
        managerSamAccount        = $managerSam
        managerTitle             = $managerTitle
        managerEmail             = $managerEmail
        managerDistinguishedName = $u.managerDN
        directReportsCount       = $resolvedDirectReports.Count
        directReports            = @($resolvedDirectReports)
        distinguishedName        = $u.distinguishedName
        enabled                  = $u.enabled
        userAccountControl       = $u.userAccountControl
        memberOf                 = @($u.memberOf)
        whenCreated              = $u.whenCreated
        whenChanged              = $u.whenChanged
    }

    $processedUsers.Add($exportObj)
}

# 6. Save JSON (UTF-8)
$jsonContent = $processedUsers | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($jsonFile, $jsonContent, [System.Text.Encoding]::UTF8)
Write-Host " [+] JSON file saved: $jsonFile" -ForegroundColor Cyan

# 7. Save CSV (UTF-8 with BOM)
$csvFlatList = $processedUsers | ForEach-Object {
    [PSCustomObject]@{
        sAMAccountName       = $_.sAMAccountName
        userPrincipalName    = $_.userPrincipalName
        displayName          = $_.displayName
        givenName            = $_.givenName
        sn                   = $_.sn
        mail                 = $_.mail
        jobTitle             = $_.jobTitle
        department           = $_.department
        company              = $_.company
        managerName          = $_.managerName
        managerSamAccount    = $_.managerSamAccount
        managerTitle         = $_.managerTitle
        directReportsCount   = $_.directReportsCount
        directReports        = ($_.directReports -join "; ")
        distinguishedName    = $_.distinguishedName
        enabled              = $_.enabled
        userAccountControl   = $_.userAccountControl
    }
}
$csvFlatList | Export-Csv -Path $csvFile -NoTypeInformation -Encoding utf8
Write-Host " [+] CSV file saved:  $csvFile" -ForegroundColor Cyan

# 8. Print Summary Statistics
$activeCount = ($processedUsers | Where-Object { $_.enabled -eq $true }).Count
$disabledCount = ($processedUsers | Where-Object { $_.enabled -eq $false }).Count
$withDept = ($processedUsers | Where-Object { $_.department }).Count
$withTitle = ($processedUsers | Where-Object { $_.jobTitle }).Count
$withManager = ($processedUsers | Where-Object { $_.managerName }).Count
$isManagerCount = ($processedUsers | Where-Object { $_.directReportsCount -gt 0 }).Count

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host " Export Summary Statistics:" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host " - Total Users Exported:    $($processedUsers.Count)" -ForegroundColor White
Write-Host " - Active Accounts:         $activeCount" -ForegroundColor Green
Write-Host " - Disabled Accounts:       $disabledCount" -ForegroundColor Yellow
Write-Host " - With Department:         $withDept" -ForegroundColor White
Write-Host " - With Job Title:          $withTitle" -ForegroundColor White
Write-Host " - With Manager Assigned:   $withManager" -ForegroundColor White
Write-Host " - People Managers (leads): $isManagerCount" -ForegroundColor White
Write-Host ""

# Top 5 Departments
Write-Host " Top 5 Departments in AD:" -ForegroundColor Magenta
$processedUsers | Where-Object { $_.department } | Group-Object department | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object {
    Write-Host "   - $($_.Name): $($_.Count) user(s)" -ForegroundColor Gray
}

Write-Host ""
Write-Host " Export finished successfully! Generated files:" -ForegroundColor Green
Write-Host " 1. $jsonFile" -ForegroundColor Cyan
Write-Host " 2. $csvFile" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host ""
