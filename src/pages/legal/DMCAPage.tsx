import { useNavigate } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, AlertTriangle, Mail } from "lucide-react";

export default function DMCAPage() {
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
            <Shield className="w-8 h-8 text-primary" />
            DMCA & Copyright Notice
          </h1>
          <p className="text-muted-foreground">
            Digital Millennium Copyright Act Policy
          </p>
        </div>

        <div className="space-y-6">
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-500">
                <AlertTriangle className="w-5 h-5" />
                Important Educational Disclaimer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-semibold">
                This entire project is created strictly for EDUCATIONAL PURPOSES ONLY.
              </p>
              <p>
                Tatakai is a frontend demonstration project showcasing modern web development practices, API integration, and user interface design. We are NOT a commercial anime streaming service.
              </p>
              <div className="p-4 rounded-lg bg-background/50 border border-border">
                <p className="font-medium mb-2">Key Points:</p>
                <ul className="list-disc list-inside space-y-2 ml-4 text-sm">
                  <li>We DO NOT host any anime content on our servers</li>
                  <li>We DO NOT own any of the anime content displayed</li>
                  <li>All content is sourced from third-party platforms via web scraping and public APIs</li>
                  <li>We are merely a frontend interface demonstrating technical capabilities</li>
                  <li>This is a non-commercial, educational project</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Copyright Respect Policy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Tatakai respects the intellectual property rights of others and expects its users to do the same. We comply with the provisions of the Digital Millennium Copyright Act (DMCA) and other applicable copyright laws.
              </p>
              <p>
                All anime content, videos, images, and related materials displayed on this platform are:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Sourced from third-party platforms and APIs</li>
                <li>Property of their respective copyright holders</li>
                <li>Not hosted or stored on our servers</li>
                <li>Displayed for educational and demonstration purposes only</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How We Aggregate Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Tatakai functions as a frontend aggregator that:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Uses public APIs from services like HiAnime, Jikan (MyAnimeList API), and others</li>
                <li>Scrapes publicly available data from various anime platforms</li>
                <li>Embeds video players from external sources</li>
                <li>Acts as a search and discovery interface</li>
              </ul>
              <p className="mt-4">
                We DO NOT:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Upload anime episodes or movies to our servers</li>
                <li>Store video files or copyrighted content</li>
                <li>Claim ownership of any anime content</li>
                <li>Monetize copyrighted content</li>
                <li>Bypass any DRM or content protection systems</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Takedown Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                If you are a copyright owner or an agent thereof and believe that any content on Tatakai infringes upon your copyrights, you may submit a takedown notification.
              </p>
              <p className="font-medium">
                Please note:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>We can only remove links to external content, as we do not host the content itself</li>
                <li>For content removal, you should contact the original hosting platform</li>
                <li>We will cooperate fully with valid DMCA requests</li>
              </ul>
              
              <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
                <h3 className="font-semibold mb-3">DMCA Notice Requirements</h3>
                <p className="text-sm mb-2">Your notice must include:</p>
                <ol className="list-decimal list-inside space-y-2 ml-4 text-sm">
                  <li>A physical or electronic signature of the copyright owner or authorized representative</li>
                  <li>Identification of the copyrighted work claimed to have been infringed</li>
                  <li>Identification of the material that is claimed to be infringing (URL on our site)</li>
                  <li>Contact information (address, telephone number, email address)</li>
                  <li>A statement of good faith belief that use is not authorized</li>
                  <li>A statement that the information is accurate and you are authorized to act</li>
                </ol>
              </div>

              <div className="mt-6 flex items-center gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <Mail className="w-6 h-6 text-primary shrink-0" />
                <div>
                  <p className="font-medium">Contact for DMCA Notices:</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Please submit DMCA notices through our suggestions/contact page or community forums. We will respond to legitimate requests within a reasonable time frame.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Counter-Notice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                If you believe that content was removed or access was disabled as a result of mistake or misidentification, you may file a counter-notice containing:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Your physical or electronic signature</li>
                <li>Identification of the removed content and its location before removal</li>
                <li>A statement under penalty of perjury that you have a good faith belief the content was removed by mistake</li>
                <li>Your name, address, and telephone number</li>
                <li>A statement consenting to jurisdiction in your location</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Repeat Infringer Policy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Tatakai will terminate user accounts of repeat copyright infringers in appropriate circumstances. Users who repeatedly upload copyrighted material or post infringing links may have their accounts suspended or permanently banned.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Good Faith Statement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                We operate in good faith as an educational project. If any copyright holder finds their content improperly linked or displayed:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>We will promptly investigate the claim</li>
                <li>We will remove links to infringing content upon valid request</li>
                <li>We encourage rights holders to contact the original hosting platforms</li>
                <li>We maintain no copies of copyrighted video content</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>Support Legal Anime Streaming</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                We encourage all users to support the anime industry by using official, licensed streaming services such as:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Crunchyroll</li>
                <li>Funimation</li>
                <li>Netflix</li>
                <li>Hulu</li>
                <li>Amazon Prime Video</li>
                <li>HIDIVE</li>
              </ul>
              <p className="mt-4">
                These services directly support anime creators, studios, and the industry as a whole.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-center mt-8">
            <Button
              onClick={() => navigate('/suggestions')}
              className="gap-2"
            >
              <Mail className="w-4 h-4" />
              Submit a DMCA Notice
            </Button>
          </div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
