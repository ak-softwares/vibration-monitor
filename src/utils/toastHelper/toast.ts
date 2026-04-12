import Toast from "react-native-toast-message";

type ToastType = "success" | "error" | "info";

interface ToastOptions {
  type?: ToastType;
  message: string;
}

export const showToast = ({
  type = "success",
  message,
}: ToastOptions) => {
  Toast.show({
    type,
    text1: message,
    position: "bottom",
    visibilityTime: 3000,
  });
};