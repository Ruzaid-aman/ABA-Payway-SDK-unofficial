$ErrorActionPreference = 'Stop'
$build = 'D:\PayWay_Postman\_build'
$parts = Get-ChildItem -LiteralPath $build -Filter 'part_*.json' | Sort-Object Name

$infoObj = Get-Content -LiteralPath (Join-Path $build 'part_00_info.json') -Raw | ConvertFrom-Json

# Group items by folder, preserving first-seen (filename) order.
$ordered = New-Object System.Collections.Specialized.OrderedDictionary
foreach ($p in $parts) {
    if ($p.Name -eq 'part_00_info.json') { continue }
    $obj = Get-Content -LiteralPath $p.FullName -Raw | ConvertFrom-Json
    $fname = [string]$obj.folder
    if (-not $ordered.Contains($fname)) { $ordered[$fname] = [System.Collections.ArrayList]::new() }
    foreach ($it in $obj.item) { $null = $ordered[$fname].Add($it) }
}

$folders = @()
foreach ($key in $ordered.Keys) {
    $folders += [pscustomobject]@{ name = $key; item = $ordered[$key] }
}

$target = [pscustomobject]@{
    info     = $infoObj.info
    item     = $folders
    variable = $infoObj.variable
}

$json = $target | ConvertTo-Json -Depth 100
$outPath = 'D:\PayWay_Postman\PayWay_API_Postman_Collection.postman_collection.json'
[System.IO.File]::WriteAllText($outPath, $json, [System.Text.UTF8Encoding]::new($false))

# validate by re-parsing
$check = Get-Content -LiteralPath $outPath -Raw | ConvertFrom-Json -ErrorAction Stop
"OK: $outPath"
"Folders: $($check.item.Count)"
$totalReqs = ($check.item | ForEach-Object { @($_.item).Count } | Measure-Object -Sum).Sum
"Requests: $totalReqs"
"Size KB: $([math]::Round((Get-Item $outPath).Length / 1KB, 1))"
