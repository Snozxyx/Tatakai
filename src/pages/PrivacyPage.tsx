import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <>
      <Background />
      <main className="min-h-screen relative z-10 py-8 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground">Last updated: January 11, 2026</p>
          </div>

          {/* Content */}
          <GlassPanel className="p-6 md:p-8 space-y-6">
            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">1. Information We Collect</h2>
              <p className="text-muted-foreground leading-relaxed">
                We collect information you provide directly to us when you create an account, update your profile, 
                use our services, or communicate with us. This may include:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Email address and username</li>
                <li>Profile information (display name, avatar, bio)</li>
                <li>Watchlist and viewing history</li>
                <li>Comments, forum posts, and tier lists you create</li>
                <li>Communications with support or other users</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">2. How We Use Your Information</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use the information we collect to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Provide, maintain, and improve our services</li>
                <li>Personalize your experience and content recommendations</li>
                <li>Send you technical notices and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Monitor and analyze trends, usage, and activities</li>
                <li>Detect, prevent, and address technical issues and abuse</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">3. Information Sharing</h2>
              <p className="text-muted-foreground leading-relaxed">
                We do not sell your personal information. We may share your information in the following circumstances:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Public Information:</strong> Profile information, comments, and posts you choose to make public</li>
                <li><strong>Service Providers:</strong> Third-party services that help us operate (authentication, hosting, analytics)</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect rights and safety</li>
                <li><strong>Business Transfers:</strong> In connection with mergers, acquisitions, or asset sales</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">4. Data Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement appropriate technical and organizational measures to protect your personal information. 
                However, no method of transmission over the Internet or electronic storage is 100% secure. 
                We use industry-standard encryption and security practices, including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Encrypted data transmission (HTTPS/TLS)</li>
                <li>Secure authentication via Supabase</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and monitoring</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">5. Your Rights and Choices</h2>
              <p className="text-muted-foreground leading-relaxed">
                You have the following rights regarding your personal information:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Update or correct your information through profile settings</li>
                <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
                <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
                <li><strong>Export:</strong> Download your data in a portable format</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">6. Cookies and Tracking</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use cookies and similar tracking technologies to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Maintain your session and remember your preferences</li>
                <li>Understand how you use our services</li>
                <li>Improve our website performance and user experience</li>
                <li>Provide personalized content and recommendations</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                You can control cookies through your browser settings, but disabling them may affect functionality.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">7. Third-Party Services</h2>
              <p className="text-muted-foreground leading-relaxed">
                Our service integrates with third-party providers:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Supabase:</strong> Authentication and database hosting</li>
                <li><strong>Vercel:</strong> Website hosting and deployment</li>
                <li><strong>External APIs:</strong> Anime data and images</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                These services have their own privacy policies. We recommend reviewing them.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">8. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Our service is not directed to children under 13. We do not knowingly collect personal information 
                from children under 13. If you believe we have collected such information, please contact us 
                immediately so we can delete it.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">9. Changes to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by 
                posting the new policy on this page and updating the "Last updated" date. Your continued use 
                of our services after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">10. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-muted/30 rounded-lg p-4 mt-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>Email:</strong> privacy@tatakai.gabhasti.tech
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Discord:</strong> Join our community server
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Response Time:</strong> We aim to respond within 48 hours
                </p>
              </div>
            </section>

            <div className="border-t border-border pt-6 mt-8">
              <p className="text-sm text-muted-foreground text-center">
                By using Tatakai, you agree to this Privacy Policy and our Terms of Service.
              </p>
            </div>
          </GlassPanel>
        </div>
      </main>
    </>
  );
}
