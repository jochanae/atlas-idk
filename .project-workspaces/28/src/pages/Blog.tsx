import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, BookOpen } from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingNav from "@/components/landing/LandingNav";

const Blog = () => {
  const { data: posts, isLoading } = useQuery({
    queryKey: ["blog-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts" as any)
        .select("id, title, slug, excerpt, cover_image_url, author_name, category, published_at, tags")
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 text-primary mb-3">
            <BookOpen className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Blog</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
            PresentQ Blog
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Tips, strategies, and insights on presentations, public speaking, and leveraging AI to communicate with confidence.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <Skeleton className="h-48 rounded-t-lg" />
                <CardContent className="pt-4 space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : posts && posts.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post: any) => (
              <Link key={post.id} to={`/blog/${post.slug}`} className="group">
                <Card className="overflow-hidden h-full hover:shadow-lg transition-shadow">
                  {post.cover_image_url && (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={post.cover_image_url}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">{post.category}</Badge>
                      {post.published_at && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(post.published_at), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                    <h2 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-primary mt-3 font-medium">
                      Read more <ArrowRight className="h-3 w-3" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-semibold">Coming soon!</p>
            <p className="text-sm">We're working on great content for you.</p>
          </div>
        )}
      </main>
      <LandingFooter />
    </div>
  );
};

export default Blog;
