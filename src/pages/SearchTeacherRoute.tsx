import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import BrandLoader from "@/components/BrandLoader";
import ProtectedRoute from "@/components/ProtectedRoute";

const StudentTeacherSearch = lazy(() => import("./SearchTeacher"));
const TeacherSearchLanding = lazy(() => import("./TeacherSearchLanding"));

const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <BrandLoader />
  </div>
);

const SearchTeacherRoute = () => {
  const { user, loading, roles } = useAuth();

  if (loading) return <RouteLoader />;

  if (!user) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <TeacherSearchLanding />
      </Suspense>
    );
  }

  if (roles.includes("admin")) return <Navigate to="/admin" replace />;
  if (roles.includes("teacher")) return <Navigate to="/teacher" replace />;
  if (roles.includes("parent")) return <Navigate to="/parent" replace />;
  if (!roles.includes("student")) return <Navigate to="/student" replace />;

  return (
    <ProtectedRoute>
      <Suspense fallback={<RouteLoader />}>
        <StudentTeacherSearch />
      </Suspense>
    </ProtectedRoute>
  );
};

export default SearchTeacherRoute;
