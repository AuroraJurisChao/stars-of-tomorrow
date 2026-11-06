import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import Nominate from "./pages/Nominate";
import Play from "./pages/Play";
import Screen from "./pages/Screen";
import Control from "./pages/Control";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/nominate" element={<Nominate />} />
      <Route path="/play" element={<Play />} />
      <Route path="/screen" element={<Screen />} />
      <Route path="/control" element={<Control />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
