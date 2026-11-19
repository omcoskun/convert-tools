# Test satırları

Bu klasördeki CSV dosyaları, `omcoskun/convert-tools` 1.0.0 sürümündeki
`contracts/test-vectors` dosyalarından aynen alınmıştır: her dosyada başlık
satırı ve testlerin kullandığı satırlar vardır.

| Dosya | Satır |
|---|---|
| `geodesic-wgs84.csv` | `ankara-istanbul` |
| `coordinate-projections.csv` | `crs-mercator-ankara` |
| `gars.csv` | `ankara-p2` |
| `georef.csv` | `ankara-p4` |

Kütüphane bu satırları değiştirirse, harita kütüphane sürümünü yükselttiği
commit'te bu dosyaları da günceller.
