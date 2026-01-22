import { useNavigate } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1000px] mx-auto pb-24 md:pb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary" />
            Terms and Conditions
          </h1>
          <p className="text-muted-foreground">
            Last updated: January 11, 2026
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Acceptance of Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                By accessing and using Tatakai, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Educational Purpose Disclaimer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-semibold text-yellow-500">
                IMPORTANT: This project is created strictly for educational purposes only.
              </p>
              <p>
                Tatakai is a frontend web application demonstration that aggregates anime content from various third-party sources through web scraping and public APIs. We do not host, store, or own any of the anime content displayed on this platform.
              </p>
              <p>
                This platform demonstrates:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Modern web development practices and technologies</li>
                <li>API integration and data aggregation techniques</li>
                <li>User interface and experience design</li>
                <li>Real-time features and interactive components</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Use License</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Permission is granted to temporarily access the materials on Tatakai for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title.
              </p>
              <p>Under this license you may not:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Modify or copy the materials</li>
                <li>Use the materials for any commercial purpose or for any public display</li>
                <li>Attempt to reverse engineer any software contained on Tatakai</li>
                <li>Remove any copyright or other proprietary notations from the materials</li>
                <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Content and Copyright</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                All anime content, including but not limited to videos, images, and descriptions, are sourced from third-party platforms and are the property of their respective copyright holders.
              </p>
              <p>
                Tatakai does not claim ownership of any third-party content. All trademarks, service marks, trade names, and logos are the property of their respective owners.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>5. User Conduct</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>You agree not to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Use the service for any unlawful purpose</li>
                <li>Harass, abuse, or harm another person</li>
                <li>Post or transmit any content that is offensive, obscene, or objectionable</li>
                <li>Attempt to gain unauthorized access to any portion of the service</li>
                <li>Interfere with or disrupt the service or servers</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>6. Privacy and Data Collection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                We collect minimal personal information necessary to provide our services. This includes:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Email address and display name (if you create an account)</li>
                <li>Watch history and preferences (stored locally and optionally in our database)</li>
                <li>Comments and ratings you submit</li>
              </ul>
              <p>
                We do not sell, trade, or share your personal information with third parties without your consent, except as required by law.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>7. Disclaimer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                The materials on Tatakai are provided "as is". Tatakai makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties. Further, Tatakai does not warrant or make any representations concerning the accuracy, likely results, or reliability of the use of the materials on its website or otherwise relating to such materials or on any sites linked to this site.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>8. Limitations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                In no event shall Tatakai or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Tatakai, even if Tatakai or a Tatakai authorized representative has been notified orally or in writing of the possibility of such damage.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>9. Revisions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Tatakai may revise these terms of service at any time without notice. By using this platform, you are agreeing to be bound by the then current version of these Terms and Conditions.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>10. Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                If you have any questions about these Terms and Conditions, please contact us through our suggestions page or community forums.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
