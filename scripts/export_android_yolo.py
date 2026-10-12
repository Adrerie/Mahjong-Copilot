#!/usr/bin/env python3
"""Export an existing 37-class Mahjong YOLO checkpoint for optional offline Android packaging.

No training, downloading or credential handling. Requires: pip install ultralytics onnx.
Run with an explicitly authorized local .pt file, then compile Android on the SAME machine.
The resulting .onnx and provenance JSON are local build assets, never auto-committed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("android/app/src/main/assets"))
    parser.add_argument("--imgsz", type=int, default=640, choices=[640])
    args = parser.parse_args()
    if not args.weights.is_file() or args.weights.suffix.lower() != ".pt":
        parser.error("--weights must point to a local .pt checkpoint")
    from ultralytics import YOLO
    import onnx

    model = YOLO(str(args.weights))
    labels = model.names
    classes = [str(labels[i]) for i in range(len(labels))]
    if len(classes) != 37 or len(set(classes)) != len(classes):
        raise SystemExit(f"Expected 37 unique classes; found {len(classes)}. Check checkpoint.")
    # Static 640x640 FP32 NCHW with raw xywh+score output; NMS runs in native Android.
    exported = Path(model.export(format="onnx", imgsz=640, batch=1, dynamic=False,
                                 simplify=False, opset=17, nms=False, device="cpu"))
    graph = onnx.load(str(exported))
    onnx.checker.check_model(graph)
    dims = lambda value: [d.dim_value for d in value.type.tensor_type.shape.dim]
    input_dims = dims(graph.graph.input[0])
    output_dims = dims(graph.graph.output[0])
    if input_dims != [1, 3, 640, 640]:
        raise SystemExit(f"Unexpected ONNX input dimensions: {input_dims}")
    if len(output_dims) != 3 or output_dims[0] != 1 or 41 not in output_dims[1:]:
        raise SystemExit(f"Unexpected ONNX output dimensions: {output_dims} (expect 4+37 raw channels)")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    dest = args.out_dir / "mahjong_detector.onnx"
    manifest = args.out_dir / "mahjong_detector.json"
    if dest.exists() or manifest.exists():
        raise SystemExit("Output model already exists; remove BOTH local assets before re-exporting")
    shutil.copyfile(exported, dest)
    metadata = {
        "format_version": 1, "model_file": dest.name,
        "model_sha256": sha256(dest), "source_sha256": sha256(args.weights),
        "input_shape": input_dims, "output_shape": output_dims,
        "imgsz": 640, "precision": "fp32", "nms": "external", "confidence": 0.22,
        "iou": 0.7, "classes": classes,
        "notice": "Verify third-party checkpoint/data/Ultralytics redistribution terms before publication",
    }
    manifest.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Packaged {dest} ({dest.stat().st_size} bytes), sha256={metadata['model_sha256']}")
    print(f"Metadata: {manifest}; classes={len(classes)}; output={output_dims}")
    print("Next: npm run build; npx cap sync android; cd android; ./gradlew assembleDebug")
    print("Keep both generated files local unless model redistribution rights are confirmed.")


if __name__ == "__main__":
    run()
