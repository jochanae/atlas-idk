import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import AdminBlogContent from "@/components/admin/AdminBlog";

const AdminBlogPage = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Blog Manager</h1>
      </div>
      <AdminBlogContent />
    </div>
  );
};

export default AdminBlogPage;

