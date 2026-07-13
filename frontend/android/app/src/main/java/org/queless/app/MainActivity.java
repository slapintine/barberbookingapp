package org.queless.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;

import com.getcapacitor.BridgeActivity;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applySystemBarContrast();
    installScheduleBackHandler();
  }

  private void applySystemBarContrast() {
    Window window = getWindow();
    window.setStatusBarColor(Color.parseColor("#2B063A"));
    window.setNavigationBarColor(Color.parseColor("#24102F"));

    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(window, window.getDecorView());
    controller.setAppearanceLightStatusBars(false);
    controller.setAppearanceLightNavigationBars(false);
  }

  private void installScheduleBackHandler() {
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        if (getBridge() == null || getBridge().getWebView() == null) {
          setEnabled(false);
          getOnBackPressedDispatcher().onBackPressed();
          setEnabled(true);
          return;
        }

        getBridge().getWebView().evaluateJavascript(
            "(function(){"
                + "if(document.body&&document.body.dataset.quelessScheduleOpen==='true'){"
                + "window.dispatchEvent(new CustomEvent('queless:native-back'));"
                + "return 'handled';"
                + "}"
                + "return 'unhandled';"
                + "})()",
            result -> {
              if ("\"handled\"".equals(result)) return;
              setEnabled(false);
              getOnBackPressedDispatcher().onBackPressed();
              setEnabled(true);
            });
      }
    });
  }
}
