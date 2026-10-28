import { Navigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import BrandLoader from "@/components/BrandLoader";
import LearningMaterialsSection from "@/components/learning-materials/LearningMaterialsSection";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

export default function TeacherLearningMaterials() {
  const { roles, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><BrandLoader /></div>;
  }
  if (!roles.includes("teacher")) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-[#fbfcfa] pb-16 md:pb-0">
      <Navbar />
      <main className="container py-8">
        <LearningMaterialsSection />
      </main>
      <BottomNav />
    </div>
  );
}
