"""Run with released deepagents-code==0.1.83 in an isolated Python environment.

Only remote materialization is replaced by a local fixture. The updater,
registry parser, cache writer, manifest parser, lock and loader are real.
"""
import json
import os
import tempfile
from importlib.metadata import version
from pathlib import Path
from unittest.mock import patch

released_version = version("deepagents-code")
assert released_version == "0.1.83", released_version

with tempfile.TemporaryDirectory(prefix="plugnz-dcode-updater-") as directory:
    root = Path(directory)
    os.environ["HOME"] = str(root)
    from deepagents_code.plugins import discovery, store
    from deepagents_code.plugins.models import MarketplaceRecord
    from deepagents_code.plugins.marketplace import load_marketplace

    source = root / "source"
    for name in ["managed", "sibling"]:
        plugin = source / name
        (plugin / "skills" / name).mkdir(parents=True)
        (plugin / "plugin.json").write_text(json.dumps({"name": name, "version": "2.0.0", "extensions": {"com.langchain.deepagents.code": {"autoUpdate": True}}}))
        (plugin / "skills" / name / "SKILL.md").write_text(f"---\nname: {name}\ndescription: proof\n---\nnew\n")
    (source / ".claude-plugin").mkdir()
    (source / ".claude-plugin" / "marketplace.json").write_text(json.dumps({"name": "proof", "plugins": [{"name": name, "source": f"./{name}"} for name in ["managed", "sibling"]]}))
    marketplace = load_marketplace(source)
    store.save_marketplace_record(MarketplaceRecord(name="proof", source_type="git", source="https://example.invalid/proof.git", install_location=str(source)))
    for name in ["managed", "sibling"]:
        plugin = root / "active" / name
        plugin.mkdir(parents=True)
        (plugin / "plugin.json").write_text(json.dumps({"name": name, "version": "1.0.0"}))
        (plugin / "payload.txt").write_text("frozen old bytes")
        store.add_installed_plugin(f"{name}@proof", install_path=str(plugin), version=None if name == "managed" else "1.0.0")
        store.set_plugin_enabled(f"{name}@proof", True)
    with patch.object(discovery, "plugin_auto_update_setting", return_value=(True, "proof")), patch.object(discovery, "materialize_marketplace_source", return_value=(marketplace, [])), patch.object(discovery, "materialize_plugin_source", side_effect=lambda market, entry, **kwargs: source / entry.name):
        updated = discovery.auto_update_plugins()
    assert updated == ("sibling@proof",), updated
    installed = store.load_installed_plugins(strict=True)
    assert installed["managed@proof"].version is None
    assert Path(installed["managed@proof"].install_path).joinpath("payload.txt").read_text() == "frozen old bytes"
    assert installed["sibling@proof"].version == "2.0.0"
    assert "managed@proof" in store.load_enabled_plugin_ids(strict=True)
    loaded = discovery.discover_plugins()
    assert any(plugin.plugin_id == "managed@proof" for plugin in loaded.plugins), loaded
    print(json.dumps({"releasedVersion": released_version, "updated": updated, "managedRegistryVersion": installed["managed@proof"].version, "managedPayload": "frozen old bytes", "managedEnabled": True, "discoveryType": type(loaded).__name__}))
