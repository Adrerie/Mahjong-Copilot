#!/usr/bin/env python3
"""Evaluate a third-party YOLO mahjong detector on actual table photos.

Prototype only: detects face-up tile candidates across the entire image.
Every detection is UNASSIGNED: a single photo cannot establish whether a tile
belongs to the player's hand, the river, a meld, or another player's hand.
No images are uploaded; no model is downloaded automatically.
Requires: pip install ultralytics
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", type=Path, required=True, help="Actual local table photo")
    parser.add_argument("--weights", type=Path, required=True, help="Locally stored YOLO .pt weights")
    parser.add_argument("--out", type=Path, default=Path("real-table-eval"))
    parser.add_argument("--conf", type=float, default=0.22)
    parser.add_argument("--imgsz", type=int, default=1280)
    args = parser.parse_args()
    if not args.image.is_file() or not args.weights.is_file():
        parser.error("--image and --weights must refer to existing local files")
    if not 0 < args.conf <= 1 or args.imgsz < 320:
        parser.error("--conf must be 0..1 and --imgsz at least 320")

    from ultralytics import YOLO

    model = YOLO(str(args.weights))
    result = model.predict(source=str(args.image), imgsz=args.imgsz,
                           conf=args.conf, verbose=False, device="cpu")[0]
    args.out.mkdir(parents=True, exist_ok=True)
    candidates = []
    class_names = result.names
    if result.boxes is not None:
        for i, box in enumerate(result.boxes):
            class_id = int(box.cls.item())
            raw_name = str(class_names[class_id])
            coords = [round(float(v), 2) for v in box.xyxy[0].tolist()]
            # Red 5s (0m/0p/0s) become ordinary fives under Chinese MCR rules.
            canonical = ("5" + raw_name[1:]) if raw_name in {"0m", "0p", "0s"} else raw_name
            candidates.append({
                "id": i,
                "box_xyxy": coords,
                "detector_label": raw_name,
                "mcr_tile_hint": canonical,
                "confidence": round(float(box.conf.item()), 4),
                "region": "unassigned",
                "reviewed": False,
            })

    # The confidence threshold is NOT a calibrated probability of correct tile recognition.
    report = {
        "source_image": str(args.image),
        "model": str(args.weights),
        "photo_width": int(result.orig_shape[1]),
        "photo_height": int(result.orig_shape[0]),
        "model_classes": len(class_names),
        "note": "Detector output only. Does not infer chronological discards, tile ownership, occluded tiles, or remaining-tile probabilities.",
        "candidates": candidates,
    }
    (args.out / "detections.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    plotted = result.plot()
    import cv2
    if not cv2.imwrite(str(args.out / "detections.jpg"), plotted):
        raise RuntimeError("Failed to save annotated photo")
    print(f"Saved {len(candidates)} unassigned candidates to {args.out.resolve()}")
    print("Review detections.jpg against the source image; do not treat all detections as river tiles.")


if __name__ == "__main__":
    main()
