package com.brasscount.app

import android.app.Dialog
import android.view.Window
import com.facebook.react.interfaces.ExtraWindowEventListener

/**
 * Leaves closing a React Native `Modal` on the Escape key to JS, as React Native already does for
 * Back.
 *
 * Since Android P, a `Dialog` cancels itself as soon as Escape goes **down** when it is cancelable
 * (`Dialog.onKeyDown`), and every Modal's dialog is. React Native only listens for Escape going
 * **up**, by which time the dialog is gone, so `onRequestClose` never reaches JS: the Modal stays
 * visible as far as React knows, and its content, still hit-tested through the Modal's host view,
 * takes touches meant for the screen under it (#125).
 *
 * A dialog that is not cancelable lets Escape through to React Native's key listener, which calls
 * `onRequestClose` on key up. Back is unaffected: React Native takes it through the dialog's
 * `OnBackPressedDispatcher`, never through `cancel()`.
 *
 * React Native reports each Modal's window here right after showing its dialog, including a dialog
 * it recreates. It applies to every `Dialog` window reported that way, so a library added later that
 * reports its own dialogs gets the same treatment; a window whose callback is not a `Dialog`
 * (wrapped by another library) is left alone.
 */
internal object ModalDialogGuard : ExtraWindowEventListener {

  override fun onExtraWindowCreate(window: Window) {
    val dialog = window.callback as? Dialog ?: return
    dialog.setCancelable(false)
    // A dialog that is not cancelable still dismisses itself on Escape when it closes on an
    // outside touch, so rule that out too. A Modal fills the window, so nothing is lost.
    dialog.setCanceledOnTouchOutside(false)
  }

  override fun onExtraWindowDestroy(window: Window) = Unit
}
