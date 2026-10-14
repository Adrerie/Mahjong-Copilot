package com.karislin.mahjong;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RealTableDetectorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
