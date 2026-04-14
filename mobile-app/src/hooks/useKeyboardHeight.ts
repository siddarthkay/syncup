import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// KeyboardAvoidingView silently fails inside RN <Modal> (separate native window
// that softInput doesn't touch). Callers apply this as paddingBottom on the sheet.
// iOS fires Will* reliably for in-sync animation; Android doesn't, so use Did*.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, e => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
