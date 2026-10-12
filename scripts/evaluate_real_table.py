#!/usr/bin/env python3
"""Evaluate a local YOLO mahjong detector on one or several real-table photos.

Runs entirely on the development machine. All boxes start UNASSIGNED and unreviewed;
a still photo cannot establish who discarded a tile or when. Requires ultralytics.
Usage: python scripts/evaluate_real_table.py --images a.jpg b.jpg c.jpg --weights model.pt
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path


def run() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--images", "--image", type=Path, nargs="+",
                       help="One or more local photographs, e.g. all three test photos")
    group.add_argument("--image-dir", type=Path,
                       help="Directory of .png/.jpg/.jpeg/.webp photographs")
    parser.add_argument("--weights", type=Path, required=True, help="Local YOLO .pt weights")
    parser.add_argument("--out", type=Path, default=Path("real-table-eval"))
    parser.add_argument("--conf", type=float, default=0.22)
    parser.add_argument("--imgsz", type=int, default=1280)
    args = parser.parse_args()

    if not args.weights.is_file():
        parser.error("--weights must be an existing local file")
    if not 0 < args.conf <= 1 or args.imgsz < 320:
        parser.error("--conf must be within (0,1] and --imgsz at least 320")
    if args.image_dir:
        if not args.image_dir.is_dir():
            parser.error("--image-dir must be an existing directory")
        images = sorted(p for p in args.image_dir.iterdir()
                        if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    else:
        images = args.images
    if not images or any(not p.is_file() for p in images):
        parser.error("Supply at least one existing image file")

    from ultralytics import YOLO
    import cv2

    model = YOLO(str(args.weights))
    model_classes = {int(k): str(v) for k, v in model.names.items()}
    args.out.mkdir(parents=True, exist_ok=True)
    reports = []
    review_rows = []
    used_names: set[str] = set()

    for index, image in enumerate(images, start=1):
        safe_stem = "".join(c if c.isalnum() or c in "-_" else "_" for c in image.stem)[:55] or "photo"
        name = safe_stem
        if name in used_names:
            name = f"{safe_stem}_{index}"
        used_names.add(name)
        target = args.out / name
        target.mkdir(parents=True, exist_ok=True)

        result = model.predict(source=str(image), imgsz=args.imgsz,
                               conf=args.conf, verbose=False, device="cpu")[0]
        candidates = []
        for tile_index, box in enumerate(result.boxes or []):
            class_id = int(box.cls.item())
            raw = model_classes.get(class_id, f"unknown_class_{class_id}")
            canonical = ("5" + raw[1:]) if raw in {"0m", "0p", "0s"} else raw
            candidates.append({
                "id": tile_index,
                "box_xyxy": [round(float(v), 2) for v in box.xyxy[0].tolist()],
                "detector_label": raw,
                "mcr_tile_hint": canonical,
                "confidence": round(float(box.conf.item()), 4),
                "region": "unassigned",
                "reviewed": False,
            })
        report = {
            "source_image": str(image),
            "weights": str(args.weights),
            "photo_width": int(result.orig_shape[1]),
            "photo_height": int(result.orig_shape[0]),
            "model_classes": model_classes,
            "candidate_count": len(candidates),
            "note": "Unreviewed object detection only; no owner, chronological river, hidden tiles or accuracy claims.",
            "candidates": candidates,
        }
        (target / "detections.json").write_text(json.dumps(report, indent=2, ensure_ascii=False),
                                                 encoding="utf-8")
        if not cv2.imwrite(str(target / "detections.jpg"), result.plot()):
            raise RuntimeError(f"Could not write annotated image: {target / 'detections.jpg'}")
        reports.append({
            "image": str(image),
            "result_dir": str(target),
            "candidate_count": len(candidates),
            "detector_label_counts": dict(sorted(Counter(c["detector_label"] for c in candidates).items())),
        })
        review_rows.append({"image": str(image), "detected": len(candidates),
                            "correct_boxes_and_labels": "", "wrong_boxes_or_labels": "",
                            "missed_visible_tiles": "", "notes": ""})
        print(f"[{index}/{len(images)}] {image.name}: {len(candidates)} unreviewed candidates -> {target}")

    (args.out / "summary.json").write_text(
        json.dumps({"number_of_images": len(reports), "model_classes": model_classes,
                    "images": reports,
                    "note": "Detection counts are not accuracy. Fill review.csv after inspecting each source and overlay."},
                   indent=2, ensure_ascii=False), encoding="utf-8")
    with (args.out / "review.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=review_rows[0].keys())
        writer.writeheader()
        writer.writerows(review_rows)
    print("Review each detections.jpg against its source. Fill review.csv manually; no scores are invented.")


if __name__ == "__main__":
    run()
