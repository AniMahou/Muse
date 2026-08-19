import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./Shell";
import { Today } from "./Today";
import { Intelligence } from "./Intelligence";
import { Review } from "./Review";
import { Aliases } from "./Aliases";
import { Catalog } from "./Catalog";
import { Team } from "./Team";

export function Console() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Today />} />
        <Route path="intelligence" element={<Intelligence />} />
        <Route path="review" element={<Review />} />
        <Route path="aliases" element={<Aliases />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="team" element={<Team />} />
        <Route path="*" element={<Navigate to="/console" replace />} />
      </Route>
    </Routes>
  );
}
