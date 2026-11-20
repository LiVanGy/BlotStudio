"""Cross-read actual files exported by the WebKit app using Python's standard library."""
import base64
import csv
import hashlib
import io
import json
import struct
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

report = json.loads(Path(sys.argv[1]).read_text())
assert "error" not in report, report.get("error")
assert report["roundtrip"], "Opening the exported WB project changed its contents"
data = {key: base64.b64decode(value) for key, value in report["saved"].items()}
assert set(data) == set("project originals csv xlsx svg svg-linked pptx png jpg tiff".split())
for sample in report["redSamples"].values():
    assert sample["size"] == [200, 120]
    r, g, b, a = sample["color"]
    assert r > 247 and g < 8 and b < 8 and a == 255, sample

original = Path("tests/fixtures/native16-raw.tif").read_bytes()
project = json.loads(data["project"])
assert base64.b64decode(project["sources"][0]["original"].split(",", 1)[1]) == original
assert len(project["groups"][0]["objects"]) == 3
with zipfile.ZipFile(io.BytesIO(data["originals"])) as archive:
    assert archive.testzip() is None
    assert archive.read("project.wbproj") == data["project"]
    source, = json.loads(archive.read("sources.json"))
    assert source["kind"] == "original" and source["path"].startswith("originals/")
    assert hashlib.sha256(archive.read(source["path"])).digest() == hashlib.sha256(original).digest()

def exported_csv():
    rows = list(csv.reader(io.StringIO(data["csv"].decode("utf-8-sig"))))
    return dict(zip(rows[1], rows[2]))

def exported_workbook():
    with zipfile.ZipFile(io.BytesIO(data["xlsx"])) as archive:
        assert archive.testzip() is None
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows = [[next(cell.itertext(), "") for cell in row] for row in sheet.findall(".//{*}row")]
        return dict(zip(rows[0], rows[1]))

for row in (exported_csv(), exported_workbook()):
    assert row["样本"] == "S1"
    assert float(row["分析像素和 RawIntDen"]) == 79
    assert float(row["方向积分信号"]) == 130991
    assert float(row["校正信号"]) == 316

embedded = ET.fromstring(data["svg"])
assert embedded.find(".//{*}image").get("href").startswith("data:image/png;base64,")
assert "WB 01" in "".join(embedded.itertext())
with zipfile.ZipFile(io.BytesIO(data["svg-linked"])) as archive:
    assert archive.testzip() is None
    svg = ET.fromstring(archive.read("figure.svg"))
    linked = svg.find(".//{*}image").get("href")
    assert linked.startswith("images/") and archive.read(linked).startswith(b"\x89PNG")
with zipfile.ZipFile(io.BytesIO(data["pptx"])) as archive:
    assert archive.testzip() is None
    slide = ET.fromstring(archive.read("ppt/slides/slide1.xml"))
    assert len(slide.findall(".//{*}pic")) == 1
    assert len(slide.findall(".//{*}sp")) == 2
    assert "WB 01" in "".join(slide.itertext())

png = data["png"]
assert png.startswith(b"\x89PNG")
phys = png.index(b"pHYs") + 4
assert struct.unpack_from(">IIB", png, phys) == (11811, 11811, 1)
tiff = data["tiff"]
assert tiff[:4] == b"II*\x00"
entries = struct.unpack_from("<H", tiff, 8)[0]
tags = {}
for i in range(entries):
    tag, typ, count, value = struct.unpack_from("<HHII", tiff, 10 + i * 12)
    tags[tag] = value
assert (tags[256], tags[257], tags[277]) == (200, 120, 3)
offset = tags[273] + 3 * (25 * 200 + 100)
assert tiff[offset:offset + 3] == bytes([255, 0, 0])
for tag in (282, 283):
    assert struct.unpack_from("<II", tiff, tags[tag]) == (300, 1)
print("PASS: independently opened 10 exported formats/packages, checked pixel and table values, original hash, editable objects, and project round trip.")
