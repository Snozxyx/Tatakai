import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useNavigate } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, AlertTriangle, Mail } from "lucide-react";
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

export default function DMCAPage() {
  useUiTranslation();
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className={`relative z-10 ${isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'} pr-6 py-6 max-w-[1000px] mx-auto pb-24 md:pb-6`}>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{uiI18n.t('app.back_b52b36b7')}</span>
        </button>

        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            {uiI18n.t('app.dmca_copyright_notice_f2d7cda0')}
          </h1>
          <p className="text-muted-foreground">
            {uiI18n.t('app.digital_millennium_copyright_act_policy_6c3617d8')}
          </p>
        </div>

        <div className="space-y-6">
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-500">
                <AlertTriangle className="w-5 h-5" />
                {uiI18n.t('app.dmca_role_title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-semibold">
                {uiI18n.t('app.dmca_role_summary')}
              </p>
              <p>
                {uiI18n.t('app.dmca_role_description')}
              </p>
              <div className="p-4 rounded-lg bg-background/50 border border-border">
                <p className="font-medium mb-2">{uiI18n.t('app.key_points_0c5cc172')}</p>
                <ul className="list-disc list-inside space-y-2 ml-4 text-sm">
                  <li>{uiI18n.t('app.dmca_role_tracking')}</li>
                  <li>{uiI18n.t('app.dmca_role_extensions')}</li>
                  <li>{uiI18n.t('app.dmca_role_ownership')}</li>
                  <li>{uiI18n.t('app.dmca_role_user_choices')}</li>
                  <li>{uiI18n.t('app.dmca_role_no_license')}</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.dmca_user_responsibility_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-semibold">
                {uiI18n.t('app.dmca_user_responsibility_summary')}
              </p>
              <p>
                {uiI18n.t('app.dmca_user_responsibility_lawful_use')}
              </p>
              <p>
                {uiI18n.t('app.dmca_user_responsibility_liability')}
              </p>
              <p className="text-sm text-muted-foreground">
                {uiI18n.t('app.dmca_user_responsibility_limits')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.copyright_respect_policy_035780e4')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.tatakai_respects_the_intellectual_property_right_4c89aea5')}
              </p>
              <p>
                {uiI18n.t('app.dmca_copyright_media')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.dmca_copyright_sources')}</li>
                <li>{uiI18n.t('app.property_of_their_respective_copyright_holders_980ee9da')}</li>
                <li>{uiI18n.t('app.dmca_copyright_source_terms')}</li>
                <li>{uiI18n.t('app.dmca_copyright_no_license')}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.dmca_extensions_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.dmca_extensions_description')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.dmca_extensions_metadata')}</li>
                <li>{uiI18n.t('app.dmca_extensions_playback')}</li>
                <li>{uiI18n.t('app.dmca_extensions_reading')}</li>
                <li>{uiI18n.t('app.dmca_extensions_progress')}</li>
              </ul>
              <p className="mt-4">
                {uiI18n.t('app.dmca_extensions_no_permission')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.dmca_extensions_no_infringement')}</li>
                <li>{uiI18n.t('app.dmca_extensions_no_redistribution')}</li>
                <li>{uiI18n.t('app.dmca_extensions_no_drm_bypass')}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.takedown_requests_2ea58b51')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.if_you_are_a_copyright_owner_or_an_agent_thereof_26f68dfc')}
              </p>
              <p className="font-medium">
                {uiI18n.t('app.please_note_b092b192')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.dmca_takedown_control')}</li>
                <li>{uiI18n.t('app.dmca_takedown_external_hosts')}</li>
                <li>{uiI18n.t('app.we_will_cooperate_fully_with_valid_dmca_requests_86d0e0a2')}</li>
              </ul>
              
              <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
                <h3 className="font-semibold mb-3">{uiI18n.t('app.dmca_notice_requirements_26f32f91')}</h3>
                <p className="text-sm mb-2">{uiI18n.t('app.your_notice_must_include_330f7a49')}</p>
                <ol className="list-decimal list-inside space-y-2 ml-4 text-sm">
                  <li>{uiI18n.t('app.a_physical_or_electronic_signature_of_the_copyri_d8d5a70b')}</li>
                  <li>{uiI18n.t('app.identification_of_the_copyrighted_work_claimed_t_56df4786')}</li>
                  <li>{uiI18n.t('app.dmca_notice_identification')}</li>
                  <li>{uiI18n.t('app.contact_information_address_telephone_number_ema_e5df76f4')}</li>
                  <li>{uiI18n.t('app.a_statement_of_good_faith_belief_that_use_is_not_1fb98b68')}</li>
                  <li>{uiI18n.t('app.a_statement_that_the_information_is_accurate_and_ae255569')}</li>
                </ol>
              </div>

              <div className="mt-6 flex items-center gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <Mail className="w-6 h-6 text-primary shrink-0" />
                <div>
                  <p className="font-medium">{uiI18n.t('app.contact_for_dmca_notices_6273b42f')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {uiI18n.t('app.dmca_notice_contact')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.counter_notice_019a6048')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.if_you_believe_that_content_was_removed_or_acces_db80f1c1')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.your_physical_or_electronic_signature_8aed1638')}</li>
                <li>{uiI18n.t('app.identification_of_the_removed_content_and_its_lo_63b0be2f')}</li>
                <li>{uiI18n.t('app.a_statement_under_penalty_of_perjury_that_you_ha_b5ae78c5')}</li>
                <li>{uiI18n.t('app.your_name_address_and_telephone_number_e8b43e15')}</li>
                <li>{uiI18n.t('app.a_statement_consenting_to_jurisdiction_in_your_l_dcdaf11a')}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.repeat_infringer_policy_c16a595b')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.tatakai_will_terminate_user_accounts_of_repeat_c_0b759908')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.good_faith_statement_5b119786')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.dmca_good_faith_description')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.we_will_promptly_investigate_the_claim_4f99629c')}</li>
                <li>{uiI18n.t('app.we_will_remove_links_to_infringing_content_upon__bfa435e2')}</li>
                <li>{uiI18n.t('app.we_encourage_rights_holders_to_contact_the_origi_5349be53')}</li>
                <li>{uiI18n.t('app.dmca_good_faith_user_responsibility')}</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>{uiI18n.t('app.dmca_support_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.dmca_support_description')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.dmca_support_anime')}</li>
                <li>{uiI18n.t('app.dmca_support_manga')}</li>
                <li>{uiI18n.t('app.dmca_support_novels')}</li>
              </ul>
              <p className="mt-4">
                {uiI18n.t('app.dmca_support_creators')}
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-center mt-8">
            <Button
              onClick={() => navigate('/suggestions')}
              className="gap-2"
            >
              <Mail className="w-4 h-4" />
              {uiI18n.t('app.submit_a_dmca_notice_a49de734')}
            </Button>
          </div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
