#!/usr/bin/env python3
"""Place an existing Mahjong-YOLO ONNX (or convert a .pt) into Android APK assets.

No training and no model download. The JSON maps detector output indices to tile names.
"""
from __future__ import annotations

import argparse
import ast
import json
import shutil
from pathlib import Path


def run() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--weights", type=Path, help="Existing local Ultralytics .pt")
    source.add_argument("--onnx", type=Path, help="Existing local ONNX exported by Ultralytics")
    parser.add_argument("--out-dir", type=Path, default=Path("android/app/src/main/assets"))
    args = parser.parse_args()

    import onnx

    if args.weights:
        if not args.weights.is_file():
            parser.error("Local .pt file does not exist")
        from ultralytics import YOLO
        model = YOLO(str(args.weights))
        labels = model.names
        classes = [str(labels[i]) for i in range(len(labels))]
        exported = Path(model.export(format="onnx", imgsz=640, batch=1, dynamic=False,
                                     simplify=False, opset=17, nms=False, device="cpu"))
    else:
        exported = args.onnx
        if not exported.is_file():
            parser.error("Local .onnx file does not exist")
        classes = []

    graph = onnx.load(str(exported))
    if not args.weights:
        metadata = {entry.key: entry.value for entry in graph.metadata_props}
        encoded_names = metadata.get("names")
        if not encoded_names:
            parser.error("ONNX lacks Ultralytics class names; use --weights to export instead")
        names = ast.literal_eval(encoded_names)
        if isinstance(names, dict):
            classes = [str(names[i] if i in names else names[str(i)]) for i in range(len(names))]
        else:
            classes = [str(name) for name in names]

    # The app's tile labels and raw output assume the existing 37-class model.
    if len(classes) != 37 or len(set(classes)) != 37:
        parser.error(f"Expected 37 tile labels; found {len(classes)}")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    destination = args.out_dir / "mahjong_detector.onnx"
    if exported.resolve() != destination.resolve():
        shutil.copyfile(exported, destination)
    (args.out_dir / "mahjong_detector.json").write_text(
        json.dumps({"classes": classes}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Android ONNX: {destination}; classes: {len(classes)}")
    print("Next: npm run build; npx cap sync android; cd android; ./gradlew assembleDebug")


if __name__ == "__main__":
    run()
