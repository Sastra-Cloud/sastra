"""Run in an isolated container with Python 3, /bin/sh, and Docker Compose CLI.

No daemon, images, network, real .env, or application code is needed. Protects
against starting storage with missing credentials and breaking external-bucket
deployments. Stubs verify shell dispatch/quoting, not the upstream image itself.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class MinioConfigTest(unittest.TestCase):
    def test_optional_profile_and_credential_boundary(self):
        for filename in ("docker-compose.yml", "docker-compose.neon.yml"):
            with self.subTest(bundle=filename), tempfile.TemporaryDirectory() as tmp:
                work = Path(tmp)
                shutil.copyfile(Path(__file__).with_name(filename), work / "compose.yml")
                # These are synthetic values; never read the checkout's .env.
                (work / ".env").write_text(
                    "POSTGRES_PASSWORD=test-only\n"
                    "DATABASE_URL=postgres://test:test@invalid/test\n"
                    "DATABASE_MIGRATION_URL=postgres://test:test@invalid/test\n"
                    "CRON_SECRET=test-only\n"
                )
                env = {"PATH": os.defpath, "HOME": tmp}
                compose = [shutil.which("docker"), "compose", "-f", str(work / "compose.yml")]

                def config(profile=False):
                    result = subprocess.run(
                        compose + (["--profile", "minio"] if profile else [])
                        + ["config", "--format", "json"],
                        cwd=tmp, env=env, capture_output=True, text=True, check=True,
                    )
                    return json.loads(result.stdout)["services"]

                # Compose must accept an absent MinIO password with the profile off.
                services = config()
                self.assertIn("app", services)
                self.assertNotIn("minio", services)
                services = config(profile=True)
                self.assertEqual(services["minio"]["ports"][0]["host_ip"], "127.0.0.1")

                # Substitute only the upstream executable; run the rendered shell.
                stub = work / "upstream"
                stub.write_text(f'#!{sys.executable}\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n')
                stub.chmod(0o700)
                (work / "mc").symlink_to(stub)
                password = "dummy with spaces 'quotes' $literal;$(exit 99)*"

                for name in ("minio", "minio-init"):
                    service = services[name]
                    self.assertEqual(service["environment"]["MINIO_ROOT_PASSWORD"], "")
                    entrypoint = list(service["entrypoint"])
                    if name == "minio":
                        self.assertIn('/usr/bin/docker-entrypoint.sh', entrypoint[2])
                        entrypoint[2] = entrypoint[2].replace('/usr/bin/docker-entrypoint.sh', str(stub))
                    command = entrypoint + (service.get("command") or [])
                    runtime_env = {
                        **env, **service["environment"],
                        "PATH": tmp + ":" + os.defpath,
                    }
                    for missing in (None, ""):
                        with self.subTest(service=name, missing=missing):
                            attempt_env = dict(runtime_env)
                            attempt_env.pop("MINIO_ROOT_PASSWORD", None)
                            if missing is not None:
                                attempt_env["MINIO_ROOT_PASSWORD"] = missing
                            result = subprocess.run(command, env=attempt_env, capture_output=True, text=True, timeout=5)
                            self.assertNotEqual(result.returncode, 0)
                            self.assertIn("Set MINIO_ROOT_PASSWORD", result.stderr)
                            self.assertEqual(result.stdout, "")

                    # mc alias output is intentionally suppressed; validate its
                    # actual argv privately before allowing bucket creation.
                    (work / "mc").unlink()
                    (work / "mc").write_text(
                        f'#!{sys.executable}\nimport os,sys\n'
                        'if sys.argv[1] == "alias":\n'
                        ' assert sys.argv[2:] == ["set", "local", "http://minio:9000", os.environ["MINIO_ROOT_USER"], os.environ["MINIO_ROOT_PASSWORD"]]\n'
                        'else:\n'
                        ' assert sys.argv[1:] == ["mb", "-p", "local/" + os.environ["R2_BUCKET"]]\n'
                        ' print("bucket-ready")\n'
                    )
                    (work / "mc").chmod(0o700)
                    result = subprocess.run(command, env={**runtime_env, "MINIO_ROOT_PASSWORD": password}, capture_output=True, text=True, timeout=5)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    if name == "minio":
                        self.assertEqual(json.loads(result.stdout), ["server", "/data", "--console-address", ":9001"])
                    else:
                        self.assertEqual(result.stdout.strip(), "bucket-ready")
                    self.assertNotIn(password, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
