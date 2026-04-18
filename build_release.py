#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
RUNTIME_FILES = [
    "manifest.json",
    "background.js",
    "content-script.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-64.png",
]


def load_manifest() -> dict:
    return json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def copy_runtime_files(staging_dir: Path) -> None:
    for rel in RUNTIME_FILES:
        src = ROOT / rel
        dst = staging_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def build_zip(source_dir: Path, target_zip: Path) -> None:
    target_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(source_dir.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(source_dir))


def build_updates_json(base_url: str, version: str, extension_id: str, xpi_name: str) -> dict:
    base = base_url.rstrip("/")
    return {
        "addons": {
            extension_id: {
                "updates": [
                    {
                        "version": version,
                        "update_link": f"{base}/{xpi_name}",
                        "applications": {
                            "gecko": {
                                "strict_min_version": "109.0"
                            }
                        }
                    }
                ]
            }
        }
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Prépare un package Firefox signable et les fichiers d'auto-distribution GitHub.")
    ap.add_argument("--base-url", help="Base HTTPS de distribution publique des fichiers signés (ex: https://USER.github.io/REPO/firefox-extension-thamous)")
    ap.add_argument("--version", help="Version à injecter dans le manifeste généré. Défaut: version actuelle du manifeste.")
    ap.add_argument("--output-dir", default=str(DIST), help="Dossier de sortie. Défaut: firefox-extension-thamous/dist")
    args = ap.parse_args()

    manifest = load_manifest()
    version = args.version or manifest["version"]
    manifest["version"] = version

    gecko = manifest.setdefault("browser_specific_settings", {}).setdefault("gecko", {})
    extension_id = gecko["id"]
    xpi_name = f"thamous-firefox-extension-{version}.xpi"
    source_zip_name = f"thamous-firefox-extension-{version}-source.zip"

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.base_url:
        gecko["update_url"] = args.base_url.rstrip("/") + "/updates.json"
    else:
        gecko.pop("update_url", None)

    with tempfile.TemporaryDirectory(prefix="thamous-firefox-release-") as tmp:
        staging_dir = Path(tmp) / "package"
        copy_runtime_files(staging_dir)
        write_json(staging_dir / "manifest.json", manifest)

        build_zip(staging_dir, output_dir / source_zip_name)
        build_zip(staging_dir, output_dir / xpi_name)

        if args.base_url:
            updates = build_updates_json(args.base_url, version, extension_id, xpi_name)
            write_json(output_dir / "updates.json", updates)

    summary = {
        "version": version,
        "extension_id": extension_id,
        "source_zip": str(output_dir / source_zip_name),
        "unsigned_xpi": str(output_dir / xpi_name),
        "updates_json": str(output_dir / "updates.json") if args.base_url else "",
        "base_url": args.base_url or "",
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
