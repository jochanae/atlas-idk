export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      approved_images: {
        Row: {
          category: string
          created_at: string
          file_url: string
          id: string
          is_approved: boolean
          name: string
          tags: string[] | null
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          file_url?: string
          id?: string
          is_approved?: boolean
          name?: string
          tags?: string[] | null
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          file_url?: string
          id?: string
          is_approved?: boolean
          name?: string
          tags?: string[] | null
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approved_images_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      arc_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          mode: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          mode?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          mode?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      arc_memories: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      audience_reactions: {
        Row: {
          created_at: string
          id: string
          presentation_id: string
          reaction_type: string
          value: string
          viewer_session: string
        }
        Insert: {
          created_at?: string
          id?: string
          presentation_id: string
          reaction_type?: string
          value: string
          viewer_session: string
        }
        Update: {
          created_at?: string
          id?: string
          presentation_id?: string
          reaction_type?: string
          value?: string
          viewer_session?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_reactions_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_resources: {
        Row: {
          created_at: string
          description: string | null
          external_url: string | null
          file_url: string | null
          id: string
          is_public: boolean
          presentation_id: string | null
          resource_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_url?: string | null
          id?: string
          is_public?: boolean
          presentation_id?: string | null
          resource_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_url?: string | null
          id?: string
          is_public?: boolean
          presentation_id?: string | null
          resource_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_resources_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_name: string
          category: string
          content: string
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          is_published: boolean
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          slug: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author_name?: string
          category?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          is_published?: boolean
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          category?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          is_published?: boolean
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_kits: {
        Row: {
          accent_color: string
          body_font: string
          created_at: string
          heading_font: string
          id: string
          logo_url: string | null
          name: string
          primary_color: string
          secondary_color: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string
          body_font?: string
          created_at?: string
          heading_font?: string
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string
          secondary_color?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string
          body_font?: string
          created_at?: string
          heading_font?: string
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string
          secondary_color?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          admin_notes: string | null
          component_stack: string | null
          created_at: string
          error_message: string | null
          error_stack: string | null
          id: string
          page_url: string | null
          resolved_at: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          component_stack?: string | null
          created_at?: string
          error_message?: string | null
          error_stack?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          component_stack?: string | null
          created_at?: string
          error_message?: string | null
          error_stack?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      coaching_reports: {
        Row: {
          created_at: string
          id: string
          improvements: Json | null
          overall_score: number | null
          pacing_analysis: Json | null
          presentation_id: string | null
          rehearsal_id: string | null
          strengths: Json | null
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          improvements?: Json | null
          overall_score?: number | null
          pacing_analysis?: Json | null
          presentation_id?: string | null
          rehearsal_id?: string | null
          strengths?: Json | null
          summary?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          improvements?: Json | null
          overall_score?: number | null
          pacing_analysis?: Json | null
          presentation_id?: string | null
          rehearsal_id?: string | null
          strengths?: Json | null
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_reports_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_reports_rehearsal_id_fkey"
            columns: ["rehearsal_id"]
            isOneToOne: false
            referencedRelation: "rehearsal_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      download_gates: {
        Row: {
          created_at: string
          custom_message: string | null
          gate_type: string
          id: string
          is_active: boolean
          lead_magnet_id: string | null
          require_name: boolean
          resource_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_message?: string | null
          gate_type?: string
          id?: string
          is_active?: boolean
          lead_magnet_id?: string | null
          require_name?: boolean
          resource_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_message?: string | null
          gate_type?: string
          id?: string
          is_active?: boolean
          lead_magnet_id?: string | null
          require_name?: boolean
          resource_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_gates_lead_magnet_id_fkey"
            columns: ["lead_magnet_id"]
            isOneToOne: false
            referencedRelation: "lead_magnets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_gates_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "audience_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminders: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          event_type: string
          id: string
          is_published: boolean | null
          join_url: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          is_published?: boolean | null
          join_url?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          is_published?: boolean | null
          join_url?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_notes: string | null
          body: string
          created_at: string
          error_message: string | null
          error_stack: string | null
          feedback_type: string
          id: string
          page_url: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          body?: string
          created_at?: string
          error_message?: string | null
          error_stack?: string | null
          feedback_type?: string
          id?: string
          page_url?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          body?: string
          created_at?: string
          error_message?: string | null
          error_stack?: string | null
          feedback_type?: string
          id?: string
          page_url?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      file_library: {
        Row: {
          ai_key_points: Json | null
          ai_suggested_slides: Json | null
          ai_summary: string | null
          annotations: Json | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_key_points?: Json | null
          ai_suggested_slides?: Json | null
          ai_summary?: string | null
          annotations?: Json | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string
          id?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_key_points?: Json | null
          ai_suggested_slides?: Json | null
          ai_summary?: string | null
          annotations?: Json | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      file_library_links: {
        Row: {
          created_at: string
          file_id: string
          id: string
          presentation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          presentation_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          presentation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_library_links_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_library_links_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          presentation_id: string | null
          subject: string
          template_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          presentation_id?: string | null
          subject?: string
          template_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          presentation_id?: string | null
          subject?: string
          template_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_templates_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_submissions: {
        Row: {
          created_at: string
          email: string
          gate_id: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          gate_id: string
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          gate_id?: string
          id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_submissions_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "download_gates"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          is_published: boolean | null
          sort_order: number | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          is_published?: boolean | null
          sort_order?: number | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_published?: boolean | null
          sort_order?: number | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_magnets: {
        Row: {
          created_at: string
          description: string | null
          external_url: string | null
          file_url: string | null
          id: string
          is_active: boolean
          magnet_type: string
          presentation_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          magnet_type?: string
          presentation_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          magnet_type?: string
          presentation_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_magnets_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_content: {
        Row: {
          category: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          is_featured: boolean | null
          sort_order: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean | null
          sort_order?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean | null
          sort_order?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string
        }
        Relationships: []
      }
      live_polls: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          options: Json
          poll_type: string
          presentation_id: string | null
          question: string
          show_results: boolean
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          options?: Json
          poll_type?: string
          presentation_id?: string | null
          question: string
          show_results?: boolean
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          options?: Json
          poll_type?: string
          presentation_id?: string | null
          question?: string
          show_results?: boolean
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_polls_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_questions: {
        Row: {
          author_name: string
          body: string
          created_at: string
          id: string
          is_answered: boolean
          is_pinned: boolean
          presentation_id: string
          upvotes: number
          voter_session: string | null
        }
        Insert: {
          author_name?: string
          body: string
          created_at?: string
          id?: string
          is_answered?: boolean
          is_pinned?: boolean
          presentation_id: string
          upvotes?: number
          voter_session?: string | null
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          is_answered?: boolean
          is_pinned?: boolean
          presentation_id?: string
          upvotes?: number
          voter_session?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_questions_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      lower_thirds: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          name: string
          presentation_id: string | null
          sort_order: number
          style: Json
          subtitle: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          name?: string
          presentation_id?: string | null
          sort_order?: number
          style?: Json
          subtitle?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          name?: string
          presentation_id?: string | null
          sort_order?: number
          style?: Json
          subtitle?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lower_thirds_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          poll_id: string
          voter_session: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          poll_id: string
          voter_session: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          poll_id?: string
          voter_session?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "live_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_collaborators: {
        Row: {
          created_at: string
          id: string
          invited_email: string | null
          presentation_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_email?: string | null
          presentation_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_email?: string | null
          presentation_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentation_collaborators_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_ctas: {
        Row: {
          created_at: string
          cta_type: string
          id: string
          is_active: boolean
          label: string
          presentation_id: string | null
          sort_order: number
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cta_type?: string
          id?: string
          is_active?: boolean
          label?: string
          presentation_id?: string | null
          sort_order?: number
          updated_at?: string
          url?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cta_type?: string
          id?: string
          is_active?: boolean
          label?: string
          presentation_id?: string | null
          sort_order?: number
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentation_ctas_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_recordings: {
        Row: {
          created_at: string
          duration_seconds: number
          file_size: number | null
          id: string
          presentation_id: string | null
          slide_timestamps: Json
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          file_size?: number | null
          id?: string
          presentation_id?: string | null
          slide_timestamps?: Json
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          file_size?: number | null
          id?: string
          presentation_id?: string | null
          slide_timestamps?: Json
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presentation_recordings_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_surveys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          presentation_id: string | null
          questions: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          presentation_id?: string | null
          questions?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          presentation_id?: string | null
          questions?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentation_surveys_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_views: {
        Row: {
          created_at: string
          id: string
          presentation_id: string
          slide_index: number
          time_spent_seconds: number
          viewer_session: string
        }
        Insert: {
          created_at?: string
          id?: string
          presentation_id: string
          slide_index?: number
          time_spent_seconds?: number
          viewer_session: string
        }
        Update: {
          created_at?: string
          id?: string
          presentation_id?: string
          slide_index?: number
          time_spent_seconds?: number
          viewer_session?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentation_views_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      presentations: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          folder: string | null
          goal: string | null
          id: string
          is_public: boolean
          slide_order: string[] | null
          theme: Json | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          folder?: string | null
          goal?: string | null
          id?: string
          is_public?: boolean
          slide_order?: string[] | null
          theme?: Json | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          folder?: string | null
          goal?: string | null
          id?: string
          is_public?: boolean
          slide_order?: string[] | null
          theme?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          referred_email: string
          referred_user_id: string | null
          referrer_id: string
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          referred_email: string
          referred_user_id?: string | null
          referrer_id: string
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          referred_email?: string
          referred_user_id?: string | null
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      rehearsal_recordings: {
        Row: {
          audio_url: string | null
          created_at: string
          duration_seconds: number
          filler_word_count: number | null
          id: string
          notes: string | null
          presentation_id: string | null
          slide_timings: Json | null
          title: string
          user_id: string
          wpm_average: number | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number
          filler_word_count?: number | null
          id?: string
          notes?: string | null
          presentation_id?: string | null
          slide_timings?: Json | null
          title?: string
          user_id: string
          wpm_average?: number | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number
          filler_word_count?: number | null
          id?: string
          notes?: string | null
          presentation_id?: string | null
          slide_timings?: Json | null
          title?: string
          user_id?: string
          wpm_average?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rehearsal_recordings_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      remote_presets: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_blocks: {
        Row: {
          block_type: string
          content: Json
          created_at: string
          description: string | null
          id: string
          name: string
          tags: string[] | null
          user_id: string
        }
        Insert: {
          block_type: string
          content?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tags?: string[] | null
          user_id: string
        }
        Update: {
          block_type?: string
          content?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      scheduling_links: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          presentation_id: string | null
          provider: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          presentation_id?: string | null
          provider?: string
          updated_at?: string
          url?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          presentation_id?: string | null
          provider?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_links_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      slide_assets: {
        Row: {
          created_at: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          slide_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_size?: number | null
          file_type: string
          id?: string
          slide_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          slide_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slide_assets_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
      slide_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          presentation_id: string
          resolved: boolean
          slide_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          presentation_id: string
          resolved?: boolean
          slide_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          presentation_id?: string
          resolved?: boolean
          slide_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slide_comments_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slide_comments_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
      slide_tags: {
        Row: {
          confidence: number
          created_at: string
          id: string
          presentation_id: string
          slide_id: string
          source: string
          tag: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          presentation_id: string
          slide_id: string
          source?: string
          tag: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          presentation_id?: string
          slide_id?: string
          source?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "slide_tags_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slide_tags_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
      slide_templates: {
        Row: {
          block_type: string
          category: string
          content: Json
          created_at: string
          creator_id: string | null
          description: string | null
          downloads: number
          id: string
          is_community: boolean
          is_premium: boolean
          name: string
          preview_url: string | null
          tags: string[] | null
        }
        Insert: {
          block_type: string
          category?: string
          content?: Json
          created_at?: string
          creator_id?: string | null
          description?: string | null
          downloads?: number
          id?: string
          is_community?: boolean
          is_premium?: boolean
          name: string
          preview_url?: string | null
          tags?: string[] | null
        }
        Update: {
          block_type?: string
          category?: string
          content?: Json
          created_at?: string
          creator_id?: string | null
          description?: string | null
          downloads?: number
          id?: string
          is_community?: boolean
          is_premium?: boolean
          name?: string
          preview_url?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      slide_versions: {
        Row: {
          block_type: string
          content: Json
          created_at: string
          id: string
          notes: string | null
          presentation_id: string
          slide_id: string
          user_id: string
          version_number: number
        }
        Insert: {
          block_type: string
          content?: Json
          created_at?: string
          id?: string
          notes?: string | null
          presentation_id: string
          slide_id: string
          user_id: string
          version_number?: number
        }
        Update: {
          block_type?: string
          content?: Json
          created_at?: string
          id?: string
          notes?: string | null
          presentation_id?: string
          slide_id?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "slide_versions_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slide_versions_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
      slides: {
        Row: {
          block_type: string
          content: Json
          created_at: string
          id: string
          notes: string | null
          presentation_id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          block_type?: string
          content?: Json
          created_at?: string
          id?: string
          notes?: string | null
          presentation_id: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          block_type?: string
          content?: Json
          created_at?: string
          id?: string
          notes?: string | null
          presentation_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slides_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      survey_responses: {
        Row: {
          answers: Json
          created_at: string
          id: string
          respondent_email: string | null
          survey_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          respondent_email?: string | null
          survey_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          respondent_email?: string | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "presentation_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      team_activity: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          id: string
          link: string | null
          team_id: string
          title: string
          user_id: string
        }
        Insert: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          link?: string | null
          team_id: string
          title: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          link?: string | null
          team_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_activity_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_email: string | null
          joined_at: string | null
          role: string
          status: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_email?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_email?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_presentations: {
        Row: {
          created_at: string
          id: string
          presentation_id: string
          shared_by: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          presentation_id: string
          shared_by: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          presentation_id?: string
          shared_by?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_presentations_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_presentations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      template_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          review: string | null
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          review?: string | null
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          review?: string | null
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_ratings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "slide_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_collaborator: {
        Args: { _presentation_id: string; _user_id: string }
        Returns: boolean
      }
      is_presentation_owner: {
        Args: { _presentation_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_admin: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
