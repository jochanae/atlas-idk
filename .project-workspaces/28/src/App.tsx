import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ArcProvider } from "@/components/arc/ArcProvider";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Editor from "./pages/Editor";
import Settings from "./pages/Settings";
import Pricing from "./pages/Pricing";
import Roadmap from "./pages/Roadmap";
import ContentLibrary from "./pages/ContentLibrary";
import BrandKit from "./pages/BrandKit";
import TemplateGallery from "./pages/TemplateGallery";
import Arc from "./pages/Arc";
import Analytics from "./pages/Analytics";
import Referrals from "./pages/Referrals";
import SharedPresentation from "./pages/SharedPresentation";
import EmbedPresentation from "./pages/EmbedPresentation";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import LegalFaq from "./pages/LegalFaq";
import Teleprompter from "./pages/Teleprompter";
import Teams from "./pages/Teams";
import MobileRehearsal from "./pages/MobileRehearsal";
import PresenterRemote from "./pages/PresenterRemote";
import LogoPreview from "./pages/LogoPreview";
import HelpCenter from "./pages/HelpCenter";
import AudienceResources from "./pages/AudienceResources";
import PublicResources from "./pages/PublicResources";
import FollowUpHub from "./pages/FollowUpHub";
import VisualAssets from "./pages/VisualAssets";
import ResourcesDashboard from "./pages/ResourcesDashboard";
import CoachingHub from "./pages/CoachingHub";
import AudienceInteract from "./pages/AudienceInteract";
import InstallApp from "./pages/InstallApp";
import Marketplace from "./pages/Marketplace";
import FeaturesDocument from "./pages/FeaturesDocument";
import SpinnerPreview from "./pages/SpinnerPreview";
import PresentingGuide from "./pages/PresentingGuide";
import SharedAnalytics from "./pages/SharedAnalytics";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import AdminBlog from "./pages/AdminBlog";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/index" element={<Navigate to="/" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/editor/:id" element={<ProtectedRoute><Editor /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
            <Route path="/roadmap" element={<ProtectedRoute><Roadmap /></ProtectedRoute>} />
            <Route path="/library" element={<ProtectedRoute><ContentLibrary /></ProtectedRoute>} />
            <Route path="/brand-kit" element={<ProtectedRoute><BrandKit /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><TemplateGallery /></ProtectedRoute>} />
            <Route path="/arc" element={<ProtectedRoute><Arc /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
            <Route path="/referrals" element={<ProtectedRoute><Referrals /></ProtectedRoute>} />
            <Route path="/view/:id" element={<SharedPresentation />} />
            <Route path="/view/:id/resources" element={<PublicResources />} />
            <Route path="/view/:id/interact" element={<AudienceInteract />} />
            <Route path="/view/:id/analytics" element={<SharedAnalytics />} />
            <Route path="/embed/:id" element={<EmbedPresentation />} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/teleprompter" element={<ProtectedRoute><Teleprompter /></ProtectedRoute>} />
            <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
            <Route path="/rehearse" element={<ProtectedRoute><MobileRehearsal /></ProtectedRoute>} />
            <Route path="/remote" element={<ProtectedRoute><PresenterRemote /></ProtectedRoute>} />
            <Route path="/help" element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} />
            <Route path="/resources" element={<ProtectedRoute><AudienceResources /></ProtectedRoute>} />
            <Route path="/follow-up" element={<ProtectedRoute><FollowUpHub /></ProtectedRoute>} />
            <Route path="/visual-assets" element={<ProtectedRoute><VisualAssets /></ProtectedRoute>} />
            <Route path="/resources-dashboard" element={<ProtectedRoute><ResourcesDashboard /></ProtectedRoute>} />
            <Route path="/coaching" element={<ProtectedRoute><CoachingHub /></ProtectedRoute>} />
            <Route path="/legal" element={<LegalFaq />} />
            <Route path="/privacy" element={<LegalFaq />} />
            <Route path="/terms" element={<LegalFaq />} />
            <Route path="/faq" element={<LegalFaq />} />
            <Route path="/logo-preview" element={<LogoPreview />} />
            <Route path="/install" element={<InstallApp />} />
            <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
            <Route path="/features" element={<FeaturesDocument />} />
            <Route path="/spinner-preview" element={<SpinnerPreview />} />
            <Route path="/presenting-guide" element={<ProtectedRoute><PresentingGuide /></ProtectedRoute>} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/admin/blog" element={<ProtectedRoute><AdminBlog /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
