package com.karislin.mahjong;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.SystemClock;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Optional, strictly local detector: no camera, external file or screen-capture permission. */
@CapacitorPlugin(name = "RealTableDetector")
public class RealTableDetectorPlugin extends Plugin {
    private final Object lock = new Object();
    private OrtSession session;
    private OrtEnvironment environment;
    private String inputName;
    private JSONArray classes;

    private static byte[] read(InputStream stream) throws Exception {
        try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[65536];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toByteArray();
        }
    }

    private void ensureLoaded() throws Exception {
        synchronized (lock) {
            if (session != null) return;
            byte[] manifestBytes = read(getContext().getAssets().open("mahjong_detector.json"));
            JSONObject metadata = new JSONObject(new String(manifestBytes, java.nio.charset.StandardCharsets.UTF_8));
            JSONArray labels = metadata.getJSONArray("classes");
            if (labels.length() != 37) throw new IllegalStateException("Expected 37-class detector");
            byte[] bytes = read(getContext().getAssets().open("mahjong_detector.onnx"));
            OrtEnvironment env = OrtEnvironment.getEnvironment();
            OrtSession.SessionOptions options = new OrtSession.SessionOptions();
            OrtSession created;
            try {
                created = env.createSession(bytes, options);
            } finally {
                options.close();
            }
            if (created.getInputNames().size() != 1 || created.getOutputNames().size() != 1) {
                created.close();
                throw new IllegalStateException("Unexpected detector input/output count");
            }
            environment = env;
            inputName = created.getInputNames().iterator().next();
            classes = labels;
            session = created;
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        new Thread(() -> {
            JSObject result = new JSObject();
            try {
                ensureLoaded();
                result.put("available", true);
                result.put("classes", classes.length());
            } catch (Exception e) {
                result.put("available", false);
                result.put("reason", "Model unavailable or invalid: " + e.getMessage());
            }
            call.resolve(result);
        }, "mahjong-model-status").start();
    }

    private static class Detection {
        final int label;
        final float score, x1, y1, x2, y2;
        Detection(int label, float score, float x1, float y1, float x2, float y2) {
            this.label = label; this.score = score;
            this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
        }
    }

    private static float clamp(float value, float max) {
        return Math.max(0f, Math.min(value, max));
    }

    private static float iou(Detection a, Detection b) {
        float w = Math.max(0f, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
        float h = Math.max(0f, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
        float intersection = w * h;
        float areaA = Math.max(0f, a.x2-a.x1) * Math.max(0f, a.y2-a.y1);
        float areaB = Math.max(0f, b.x2-b.x1) * Math.max(0f, b.y2-b.y1);
        float union = areaA + areaB - intersection;
        return union <= 0 ? 0 : intersection / union;
    }

    private JSONArray infer(Bitmap source) throws Exception {
        final int imageSize = 640, width = source.getWidth(), height = source.getHeight();
        float scale = Math.min(imageSize / (float) width, imageSize / (float) height);
        int resizedW = Math.max(1, Math.round(width * scale));
        int resizedH = Math.max(1, Math.round(height * scale));
        int left = (imageSize - resizedW) / 2, top = (imageSize - resizedH) / 2;
        Bitmap resized = Bitmap.createScaledBitmap(source, resizedW, resizedH, true);
        Bitmap letterboxed = Bitmap.createBitmap(imageSize, imageSize, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(letterboxed);
        canvas.drawColor(Color.rgb(114, 114, 114));
        canvas.drawBitmap(resized, left, top, null);
        if (resized != source) resized.recycle();
        int[] pixels = new int[imageSize * imageSize];
        letterboxed.getPixels(pixels, 0, imageSize, 0, 0, imageSize, imageSize);
        letterboxed.recycle();
        int plane = imageSize * imageSize;
        float[] input = new float[plane * 3];
        for (int i = 0; i < plane; i++) {
            int argb = pixels[i];
            input[i] = Color.red(argb) / 255f;
            input[plane + i] = Color.green(argb) / 255f;
            input[plane * 2 + i] = Color.blue(argb) / 255f;
        }
        float[][][] output;
        // A cached session is protected because repeated WebView requests may overlap.
        synchronized (lock) {
            try (OnnxTensor tensor = OnnxTensor.createTensor(environment, FloatBuffer.wrap(input),
                     new long[]{1, 3, 640, 640});
                 OrtSession.Result result = session.run(Collections.singletonMap(inputName, tensor))) {
                output = (float[][][]) result.get(0).getValue();
            }
        }
        if (output.length != 1) throw new IllegalStateException("Unexpected detection batch");
        float[][] raw = output[0];
        boolean channelsFirst = raw.length == 41;
        if (!channelsFirst && (raw.length == 0 || raw[0].length != 41))
            throw new IllegalStateException("Unexpected detector layout");
        int count = channelsFirst ? raw[0].length : raw.length;
        List<Detection> candidates = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            int bestClass = -1;
            float best = 0.22f;
            for (int c = 0; c < 37; c++) {
                float score = channelsFirst ? raw[c + 4][i] : raw[i][c + 4];
                if (score > best) { best = score; bestClass = c; }
            }
            if (bestClass < 0) continue;
            float cx = channelsFirst ? raw[0][i] : raw[i][0];
            float cy = channelsFirst ? raw[1][i] : raw[i][1];
            float bw = channelsFirst ? raw[2][i] : raw[i][2];
            float bh = channelsFirst ? raw[3][i] : raw[i][3];
            if (!Float.isFinite(cx) || !Float.isFinite(cy) || !Float.isFinite(bw) || !Float.isFinite(bh)) continue;
            float x1 = clamp((cx - bw / 2f - left) / scale / width, 1f);
            float y1 = clamp((cy - bh / 2f - top) / scale / height, 1f);
            float x2 = clamp((cx + bw / 2f - left) / scale / width, 1f);
            float y2 = clamp((cy + bh / 2f - top) / scale / height, 1f);
            if (x2 <= x1 || y2 <= y1) continue;
            candidates.add(new Detection(bestClass, best, x1, y1, x2, y2));
        }
        candidates.sort((a,b) -> Float.compare(b.score, a.score));
        List<Detection> chosen = new ArrayList<>();
        for (Detection candidate : candidates) {
            boolean duplicate = false;
            for (Detection previous : chosen) {
                if (candidate.label == previous.label && iou(candidate, previous) > 0.7f) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) chosen.add(candidate);
            if (chosen.size() == 150) break;
        }
        JSONArray detections = new JSONArray();
        for (Detection d : chosen) {
            JSObject item = new JSObject();
            item.put("label", classes.getString(d.label));
            item.put("confidence", d.score);
            item.put("x1", d.x1);
            item.put("y1", d.y1);
            item.put("x2", d.x2);
            item.put("y2", d.y2);
            detections.put(item);
        }
        return detections;
    }

    @PluginMethod
    public void detect(PluginCall call) {
        String image = call.getString("image");
        if (image == null || !image.startsWith("data:image/") || image.length() > 12_000_000) {
            call.reject("Image must be a local compressed data URL below 12 MB");
            return;
        }
        new Thread(() -> {
            try {
                ensureLoaded();
                int comma = image.indexOf(',');
                if (comma < 0 || !image.substring(0, comma).contains(";base64")) {
                    throw new IllegalArgumentException("Expected base64 image");
                }
                byte[] bytes = Base64.decode(image.substring(comma + 1), Base64.DEFAULT);
                Bitmap photo = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (photo == null || photo.getWidth() > 4096 || photo.getHeight() > 4096) {
                    throw new IllegalArgumentException("Invalid or oversized image");
                }
                long start = SystemClock.elapsedRealtime();
                JSONArray boxes = infer(photo);
                JSObject response = new JSObject();
                response.put("detections", boxes);
                response.put("width", photo.getWidth());
                response.put("height", photo.getHeight());
                response.put("elapsedMs", SystemClock.elapsedRealtime() - start);
                photo.recycle();
                call.resolve(response);
            } catch (Exception e) {
                call.reject("On-device detection failed: " + e.getMessage());
            }
        }, "mahjong-model-inference").start();
    }
}
