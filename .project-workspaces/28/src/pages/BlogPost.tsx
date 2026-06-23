import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Calendar, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingNav from "@/components/landing/LandingNav";

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading, error } = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts" as any)
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <div className="max-w-3xl mx-auto px-4 py-16 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <LandingFooter />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Post not found</h1>
          <Link to="/blog" className="text-primary hover:underline">
            ← Back to Blog
          </Link>
        </div>
        <LandingFooter />
      </div>
    );
  }

  const metaTitle = post.meta_title || post.title;
  const metaDescription = post.meta_description || post.excerpt || `Read "${post.title}" on the PresentQ blog.`;

  return (
    <div className="min-h-screen bg-background">
      <title>{metaTitle} | PresentQ Blog</title>
      <meta name="description" content={metaDescription} />
      <meta property="og:title" content={metaTitle} />
      <meta property="og:description" content={metaDescription} />
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "headline": post.title,
          "description": metaDescription,
          "author": { "@type": "Person", "name": post.author_name },
          "datePublished": post.published_at,
          "dateModified": post.updated_at,
          "publisher": { "@type": "Organization", "name": "PresentQ", "url": "https://presentq.app" },
          ...(post.cover_image_url && { "image": post.cover_image_url }),
        })}
      </script>
      <LandingNav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to Blog
        </Link>

        <article>
          <Badge variant="secondary" className="mb-3">{post.category}</Badge>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">{post.title}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8">
            <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {post.author_name}</span>
            {post.published_at && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> {format(new Date(post.published_at), "MMMM d, yyyy")}
              </span>
            )}
          </div>

          {post.cover_image_url && (
            <img src={post.cover_image_url} alt={post.title} className="w-full rounded-lg mb-8 aspect-video object-cover" />
          )}

          <div className="prose prose-sm sm:prose dark:prose-invert max-w-none">
            <ReactMarkdown>{post.content}</ReactMarkdown>
          </div>

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-border">
              {post.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-xs">#{tag}</Badge>
              ))}
            </div>
          )}
        </article>
      </main>
      <LandingFooter />
    </div>
  );
};

export default BlogPost;
