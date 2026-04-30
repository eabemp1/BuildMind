$exclude = '.git','node_modules','.next'
$paths = Get-ChildItem -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object { $_.FullName }
Compress-Archive -Path $paths -DestinationPath ".\buildmind_v4_final_clean.zip" -Force
Get-ChildItem ".\buildmind_v4_final_clean.zip" | Select-Object FullName, Length
