import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ChatNotificationToast from "@/components/ChatNotificationToast";
import SessionConflictDialog from "@/components/SessionConflictDialog";

// Lazy-loaded pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const SearchTeacher = lazy(() => import("./pages/SearchTeacher"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const ParentDashboard = lazy(() => import("./pages/ParentDashboard"));
const Booking = lazy(() => import("./pages/Booking"));
const LiveSession = lazy(() => import("./pages/LiveSession"));
const Profile = lazy(() => import("./pages/Profile"));
const Rating = lazy(() => import("./pages/Rating"));
const Install = lazy(() => import("./pages/Install"));
const AITutor = lazy(() => import("./pages/AITutor"));
const Pricing = lazy(() => import("./pages/Pricing"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Chat = lazy(() => import("./pages/Chat"));
const SupportChat = lazy(() => import("./pages/SupportChat"));
const SubscriptionDetails = lazy(() => import("./pages/SubscriptionDetails"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FAQ = lazy(() => import("./pages/FAQ"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Terms = lazy(() => import("./pages/Terms"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const TeacherWallet = lazy(() => import("./pages/TeacherWallet"));
const CompleteProfile = lazy(() => import("./pages/CompleteProfile"));
const TeachWithUs = lazy(() => import("./pages/TeachWithUs"));
const TeacherAssignments = lazy(() => import("./pages/TeacherAssignments"));
const StudentAssignments = lazy(() => import("./pages/StudentAssignments"));
const ReviewSubmission = lazy(() => import("./pages/ReviewSubmission"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const HomeworkSolver = lazy(() => import("./pages/HomeworkSolver"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min cache
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <BrandLoader />
  </div>
);

const DashboardRedirect = () => {
  const { roles, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (roles.includes("admin")) return <Navigate to="/admin" replace />;
  if (roles.includes("teacher")) return <Navigate to="/teacher" replace />;
  return <Navigate to="/student" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Navigate to="/login?signup=1" replace />} />
              <Route path="/signup" element={<Navigate to="/login?signup=1" replace />} />
              <Route path="/teacher-register" element={<Navigate to="/login?signup=1&role=teacher" replace />} />
              <Route path="/teacher-signup" element={<Navigate to="/login?signup=1&role=teacher" replace />} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/complete-profile" element={<ProtectedRoute><CompleteProfile /></ProtectedRoute>} />
              <Route path="/search" element={<SearchTeacher />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/teach-with-us" element={<TeachWithUs />} />
              <Route path="/install" element={<Install />} />
              <Route path="/student" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
              <Route path="/subscription-details" element={<ProtectedRoute><SubscriptionDetails /></ProtectedRoute>} />
              <Route path="/teacher" element={<ProtectedRoute><TeacherDashboard /></ProtectedRoute>} />
              <Route path="/teacher/wallet" element={<ProtectedRoute><TeacherWallet /></ProtectedRoute>} />
              <Route path="/parent" element={<ProtectedRoute><ParentDashboard /></ProtectedRoute>} />
              <Route path="/booking" element={<ProtectedRoute><Booking /></ProtectedRoute>} />
              <Route path="/session" element={<ProtectedRoute><LiveSession /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
              <Route path="/support" element={<ProtectedRoute><SupportChat /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/rating" element={<ProtectedRoute><Rating /></ProtectedRoute>} />
              <Route path="/ai-tutor" element={<ProtectedRoute><AITutor /></ProtectedRoute>} />
              <Route path="/homework-solver" element={<ProtectedRoute><HomeworkSolver /></ProtectedRoute>} />
              <Route path="/teacher/assignments" element={<ProtectedRoute><TeacherAssignments /></ProtectedRoute>} />
              <Route path="/teacher/assignments/review/:id" element={<ProtectedRoute><ReviewSubmission /></ProtectedRoute>} />
              <Route path="/student/assignments" element={<ProtectedRoute><StudentAssignments /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/refund" element={<RefundPolicy />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <ChatNotificationToast />
          <SessionConflictDialog />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
