import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { ItemDetail } from "./pages/ItemDetail";
import { Intake } from "./pages/Intake";
import { Locations } from "./pages/Locations";
import { POS } from "./pages/POS";
import { Transactions } from "./pages/Transactions";
import { Settings } from "./pages/Settings";
import { PublicItem } from "./pages/PublicItem";
import { Catalog } from "./pages/Catalog";
import { Shows } from "./pages/Shows";
import { Fulfillment } from "./pages/Fulfillment";
import { Offers } from "./pages/Offers";
import { Analytics } from "./pages/Analytics";

export default function App() {
  return (
    <Routes>
      {/* Public customer-facing QR landing page — no dealer chrome */}
      <Route path="/i/:id" element={<PublicItem />} />

      {/* Dealer / admin app */}
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/inventory/:id" element={<ItemDetail />} />
        <Route path="/intake" element={<Intake />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/shows" element={<Shows />} />
        <Route path="/fulfillment" element={<Fulfillment />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
