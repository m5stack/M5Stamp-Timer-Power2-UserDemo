"""Create one flash-at-0x0 image for each ESP32 architecture after a build."""
from __future__ import annotations

import datetime
import pathlib
import subprocess
import sys
from zoneinfo import ZoneInfo

try:
    Import("env")  # type: ignore[name-defined]
except NameError:
    env = None


def _merge() -> None:
    if env is None:
        return

    project = pathlib.Path(env.subst("$PROJECT_DIR"))  # type: ignore[name-defined]
    build = pathlib.Path(env.subst("$BUILD_DIR"))  # type: ignore[name-defined]
    board = env.subst("$BOARD")  # type: ignore[name-defined]
    env_name = env.subst("$PIOENV")  # type: ignore[name-defined]

    if board == "esp32dev":
        chip = "esp32"
        bootloader_offset = "0x1000"
        flash_mode = "dio"
        flash_freq = "40m"
        flash_size = "4MB"
    elif board == "esp32-s3-devkitc-1":
        chip = "esp32s3"
        bootloader_offset = "0x0"
        flash_mode = "dout"
        flash_freq = "80m"
        flash_size = "4MB"
    else:
        print(f"[merge] skip unsupported board {board}")
        return

    esptool_dir = pathlib.Path(env.PioPlatform().get_package_dir("tool-esptoolpy"))  # type: ignore[name-defined]
    framework_dir = pathlib.Path(env.PioPlatform().get_package_dir("framework-arduinoespressif32"))  # type: ignore[name-defined]
    esptool = esptool_dir / "esptool.py"
    boot_app0 = framework_dir / "tools" / "partitions" / "boot_app0.bin"
    required = [
        build / "bootloader.bin",
        build / "partitions.bin",
        build / "firmware.bin",
        boot_app0,
        esptool,
    ]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        raise SystemExit("[merge] missing build input: " + ", ".join(missing))

    version = env.GetProjectOption("custom_firmware_version", "0.1.0")  # type: ignore[name-defined]
    owner = env.GetProjectOption("custom_firmware_owner", "LHY")  # type: ignore[name-defined]
    commit = subprocess.check_output(
        ["git", "rev-parse", "--short=8", "HEAD"], cwd=project, text=True
    ).strip()
    build_date = datetime.datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y%m%d")
    arch = "ESP32S3" if chip == "esp32s3" else "ESP32"
    output_dir = project / "dist"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f"S021-{arch}-UserDemo-v{version}-{commit}-{owner}-{build_date}_0x0.bin"
    cmd = [
        sys.executable,
        str(esptool),
        "--chip",
        chip,
        "merge_bin",
        "-o",
        str(output),
        "--flash_mode",
        flash_mode,
        "--flash_freq",
        flash_freq,
        "--flash_size",
        flash_size,
        bootloader_offset,
        str(build / "bootloader.bin"),
        "0x8000",
        str(build / "partitions.bin"),
        "0xe000",
        str(boot_app0),
        "0x10000",
        str(build / "firmware.bin"),
    ]
    subprocess.check_call(cmd, cwd=project)
    print(f"[merge] {env_name}: {output} ({output.stat().st_size} bytes)")


if env is not None:
    env.AddPostAction("buildprog", lambda *_args, **_kwargs: _merge())  # type: ignore[name-defined]
