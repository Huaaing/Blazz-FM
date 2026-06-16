import { RadioProvider } from "./RadioContext";
import { RadioFloat } from "./RadioFloat";

export default function App() {
  return (
    <RadioProvider>
      <RadioFloat />
    </RadioProvider>
  );
}
