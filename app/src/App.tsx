import { Routes, Route } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Sessions from "@/pages/Sessions";
import SessionDetail from "@/pages/SessionDetail";
import ModelLab from "@/pages/ModelLab";
import Hardware from "@/pages/Hardware";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/model" element={<ModelLab />} />
        <Route path="/hardware" element={<Hardware />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
      <Toaster position="bottom-right" theme="dark" />
    </Layout>
  );
}
