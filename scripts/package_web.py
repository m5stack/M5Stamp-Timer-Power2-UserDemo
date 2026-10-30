#!/usr/bin/env python3
"""Package both static Web variants into the release archive."""
from __future__ import annotations

import argparse
import datetime
import pathlib
import re
import subprocess
import zipfile
from zoneinfo import ZoneInfo


def project_version(project: pathlib.Path) -> str:
    text = (project / "platformio.ini").read_text(encoding="utf-8")
    match = re.search(r"^custom_firmware_version\s*=\s*(\S+)\s*$", text, re.MULTILINE)
    return match.group(1) if match else "0.1.0"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--version")
    parser.add_argument("--commit")
    parser.add_argument("--owner", default="LHY")
    parser.add_argument("--date", help="Build date in YYYYMMDD format")
    args = parser.parse_args()

    project = args.project.resolve()
    version = args.version or project_version(project)
    commit = args.commit or subprocess.check_output(
        ["git", "rev-parse", "--short=8", "HEAD"], cwd=project, text=True
    ).strip()
    build_date = args.date or datetime.datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y%m%d")
    output_dir = project / "dist"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f"S021-Web-UserDemo-v{version}-{commit}(commit)-{args.owner}-{build_date}.zip"

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for folder_name in ("web", "esp_web"):
            folder = project / folder_name
            if not folder.is_dir():
                raise SystemExit(f"[web-package] missing directory: {folder}")
            for file in sorted(folder.rglob("*")):
                if file.is_file():
                    archive.write(file, file.relative_to(project).as_posix())

    print(f"[web-package] {output} ({output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
