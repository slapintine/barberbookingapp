package org.queless.app;

import android.graphics.Color;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
      WebView.setWebContentsDebuggingEnabled(false);
    }
    registerPlugin(QuelessNotificationSettingsPlugin.class);
    super.onCreate(savedInstanceState);
    if (getSupportActionBar() != null) {
      getSupportActionBar().hide();
    }
    applySystemBarContrast();
    installScheduleBackHandler();
  }

  @Override
  public void onResume() {
    super.onResume();
    applySystemBarContrast();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) {
      applySystemBarContrast();
    }
  }

  private void applySystemBarContrast() {
    Window window = getWindow();
    WindowCompat.setDecorFitsSystemWindows(window, true);
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    window.setStatusBarColor(Color.parseColor("#2B063A"));
    window.setNavigationBarColor(Color.parseColor("#24102F"));
    window.getDecorView().setSystemUiVisibility(
        window.getDecorView().getSystemUiVisibility()
            & ~View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            & ~View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            & ~View.SYSTEM_UI_FLAG_LAYOUT_STABLE);

    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(window, window.getDecorView());
    controller.setAppearanceLightStatusBars(true);
    controller.setAppearanceLightNavigationBars(true);
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
                + "if(document.body&&document.body.dataset.quelessPortfolioLightboxOpen==='true'){"
                + "window.dispatchEvent(new CustomEvent('queless:native-back'));"
                + "return 'handled';"
                + "}"
                + "if(document.body&&document.body.dataset.quelessServiceDetailsOpen==='true'){"
                + "window.dispatchEvent(new CustomEvent('queless:native-back'));"
                + "return 'handled';"
                + "}"
                + "if(document.body&&document.body.dataset.quelessBookingOpen==='true'){"
                + "window.dispatchEvent(new CustomEvent('queless:native-back'));"
                + "return 'handled';"
                + "}"
                + "if(document.body&&document.body.dataset.quelessQuoteRequestOpen==='true'){"
                + "window.dispatchEvent(new CustomEvent('queless:native-back'));"
                + "return 'handled';"
                + "}"
                + "if(document.body&&document.body.dataset.quelessSmartMatchOpen==='true'){"
                + "window.dispatchEvent(new CustomEvent('queless:native-back'));"
                + "return 'handled';"
                + "}"
                + "if(document.body&&document.body.dataset.quelessProviderCoachOpen==='true'){"
                + "window.dispatchEvent(new CustomEvent('queless:native-back'));"
                + "return 'handled';"
                + "}"
                + "if(document.body&&document.body.dataset.quelessMapOpen==='true'){"
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
