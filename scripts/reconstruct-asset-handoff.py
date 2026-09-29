from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import zipfile
from pathlib import Path, PurePosixPath


BRANCH = "orchestra-asset-handoff"
REMOTE_REF = f"refs/remotes/origin/{BRANCH}"
PART_COUNT = 5
EXPECTED_ZIP_SHA256 = "d57352b48310801e94fc89e2fbcacbe50019bfe9b4cafe6d3a80b353a3e0d911"
EXPECTED_ASSET_COUNT = 35


def run_git(*args: str) -> bytes:
    result = subprocess.run(
        ["git", *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            result.stderr.decode("utf-8", errors="replace").strip()
            or result.stdout.decode("utf-8", errors="replace").strip()
            or f"git {' '.join(args)} failed"
        )
    return result.stdout


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_member(name: str) -> bool:
    path = PurePosixPath(name)
    if path.is_absolute():
        return False
    if any(part in {"", ".", ".."} for part in path.parts):
        return False
    return True


def main() -> int:
    root = Path.cwd()
    plans_root = root / "Plans" / "UI-Assets"
    transport_root = plans_root / "transport"
    assets_root = plans_root / "assets"

    transport_root.mkdir(parents=True, exist_ok=True)

    run_git(
        "fetch",
        "origin",
        f"refs/heads/{BRANCH}:{REMOTE_REF}",
    )

    part_payloads: list[bytes] = []
    for index in range(PART_COUNT):
        zip_name = f"jla-transfer-part-{index:03d}.zip"
        spec = f"{REMOTE_REF}:handoff/{zip_name}"
        zip_bytes = run_git("show", spec)
        with zipfile.ZipFile(Path(zip_name), mode="w") as _:
            pass
        zip_path = transport_root / zip_name
        zip_path.write_bytes(zip_bytes)

        with zipfile.ZipFile(zip_path, "r") as archive:
            names = archive.namelist()
            expected_bin = f"part-{index:03d}.bin"
            expected_hash = f"part-{index:03d}.sha256"
            if sorted(names) != sorted([expected_bin, expected_hash]):
                raise RuntimeError(f"unexpected members in {zip_name}: {names}")
            payload = archive.read(expected_bin)
            expected = archive.read(expected_hash).decode("ascii").strip().lower()
            actual = sha256_bytes(payload)
            if actual != expected:
                raise RuntimeError(
                    f"{zip_name} payload hash mismatch: expected {expected}, got {actual}"
                )
            part_payloads.append(payload)

    combined = b"".join(part_payloads)
    combined_hash = sha256_bytes(combined)
    if combined_hash != EXPECTED_ZIP_SHA256:
        raise RuntimeError(
            f"reconstructed ZIP hash mismatch: expected {EXPECTED_ZIP_SHA256}, "
            f"got {combined_hash}"
        )

    combined_path = transport_root / "learn-japanese-ui-assets-transfer.zip"
    combined_path.write_bytes(combined)

    with zipfile.ZipFile(combined_path, "r") as archive:
        names = archive.namelist()
        if "MANIFEST.json" not in names:
            raise RuntimeError("transfer ZIP is missing MANIFEST.json")
        if len(names) != len(set(names)):
            raise RuntimeError("transfer ZIP contains duplicate member names")
        for name in names:
            if not safe_member(name):
                raise RuntimeError(f"unsafe archive member: {name}")
            if name != "MANIFEST.json" and not name.startswith("assets/"):
                raise RuntimeError(f"unexpected archive member: {name}")

        manifest = json.loads(archive.read("MANIFEST.json").decode("utf-8"))
        if manifest.get("schema_version") != 2:
            raise RuntimeError("transfer manifest schema_version must be 2")
        files = manifest.get("files")
        if not isinstance(files, list) or len(files) != EXPECTED_ASSET_COUNT:
            raise RuntimeError(
                f"transfer manifest must describe {EXPECTED_ASSET_COUNT} assets"
            )
        if manifest.get("file_count") != EXPECTED_ASSET_COUNT:
            raise RuntimeError(
                f"transfer manifest file_count must be {EXPECTED_ASSET_COUNT}"
            )

        seen: set[str] = set()
        verified: list[tuple[str, bytes, str]] = []
        for entry in files:
            if not isinstance(entry, dict):
                raise RuntimeError("invalid manifest asset entry")
            name = entry.get("name")
            expected_hash = entry.get("transfer_sha256")
            if not isinstance(name, str) or not name or name in seen:
                raise RuntimeError(f"invalid or duplicate asset name: {name!r}")
            if not isinstance(expected_hash, str) or len(expected_hash) != 64:
                raise RuntimeError(f"invalid transfer_sha256 for {name}")
            seen.add(name)
            member = f"assets/{name}"
            if names.count(member) != 1:
                raise RuntimeError(f"expected exactly one archive member for {name}")
            payload = archive.read(member)
            actual = sha256_bytes(payload)
            if actual != expected_hash.lower():
                raise RuntimeError(
                    f"asset hash mismatch for {name}: "
                    f"expected {expected_hash}, got {actual}"
                )
            verified.append((name, payload, actual))

    if assets_root.exists():
        shutil.rmtree(assets_root)
    assets_root.mkdir(parents=True, exist_ok=True)

    for name, payload, expected_hash in verified:
        destination = assets_root / name
        destination.write_bytes(payload)
        actual = hashlib.sha256(destination.read_bytes()).hexdigest()
        if actual != expected_hash:
            raise RuntimeError(f"post-extract hash mismatch for {name}")

    staging_manifest = {
        "schema_version": 1,
        "source": "private GitHub handoff branch",
        "handoff_branch": BRANCH,
        "reconstructed_zip_sha256": EXPECTED_ZIP_SHA256,
        "asset_count": len(verified),
        "assets": [
            {"name": name, "sha256": digest}
            for name, _, digest in verified
        ],
    }
    (plans_root / "STAGED_MANIFEST.json").write_text(
        json.dumps(staging_manifest, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"STAGED_ASSETS={len(verified)}")
    print(f"STAGED_SHA256={EXPECTED_ZIP_SHA256}")
    print(f"STAGED_PATH={assets_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
