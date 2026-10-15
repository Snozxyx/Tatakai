import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Link, useNavigate } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

export default function TermsPage() {
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
            <FileText className="w-8 h-8 text-primary" />
            {uiI18n.t('app.terms_and_conditions_894031ed')}
          </h1>
          <p className="text-muted-foreground">
            {uiI18n.t('app.last_updated_september_28_2026_13b452ee')}
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.1_acceptance_of_terms_dc556ba4')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.by_accessing_and_using_tatakai_you_accept_and_ag_ffc253b5')}
              </p>
              <p>
                {uiI18n.t('app.any_content_you_post_comment_rate_or_otherwise_c_bbcfa5f1')}{" "}
                <Link to="/community-guidelines" className="text-primary hover:underline">{uiI18n.t('app.community_guidelines_75343669')}</Link>{uiI18n.t('app.which_form_part_of_these_terms_d9be07f8')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.2_educational_purpose_disclaimer_18fe6255')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-semibold text-yellow-500">
                {uiI18n.t('app.important_this_project_is_created_strictly_for_e_a8dbdf95')}
              </p>
              <p>
                {uiI18n.t('app.tatakai_is_a_frontend_web_application_demonstrat_1d826053')}
              </p>
              <p>
                {uiI18n.t('app.this_platform_demonstrates_09c53172')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.modern_web_development_practices_and_technologie_b0d49add')}</li>
                <li>{uiI18n.t('app.api_integration_and_data_aggregation_techniques_235b1600')}</li>
                <li>{uiI18n.t('app.user_interface_and_experience_design_b463a625')}</li>
                <li>{uiI18n.t('app.real_time_features_and_interactive_components_b350cf51')}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.3_use_license_2958d393')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.permission_is_granted_to_temporarily_access_the__28670d73')}
              </p>
              <p>{uiI18n.t('app.under_this_license_you_may_not_9f5e0d86')}</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.modify_or_copy_the_materials_ed8957ab')}</li>
                <li>{uiI18n.t('app.use_the_materials_for_any_commercial_purpose_or__4a8d4297')}</li>
                <li>{uiI18n.t('app.attempt_to_reverse_engineer_any_software_contain_3d142ab7')}</li>
                <li>{uiI18n.t('app.remove_any_copyright_or_other_proprietary_notati_cf939a1b')}</li>
                <li>{uiI18n.t('app.transfer_the_materials_to_another_person_or_mirr_f36fd53e')}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.4_content_and_copyright_6f5fe77e')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.all_anime_content_including_but_not_limited_to_v_d461c493')}
              </p>
              <p>
                {uiI18n.t('app.tatakai_does_not_claim_ownership_of_any_third_pa_c42d2cca')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.5_user_conduct_ad604292')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>{uiI18n.t('app.you_agree_not_to_cf3600de')}</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.use_the_service_for_any_unlawful_purpose_3121c59b')}</li>
                <li>{uiI18n.t('app.harass_abuse_or_harm_another_person_a3640d42')}</li>
                <li>{uiI18n.t('app.post_or_transmit_any_content_that_is_offensive_o_339be0cc')}</li>
                <li>{uiI18n.t('app.attempt_to_gain_unauthorized_access_to_any_porti_8aa662bb')}</li>
                <li>{uiI18n.t('app.interfere_with_or_disrupt_the_service_or_servers_2de13dc2')}</li>
              </ul>
              <p>
                {uiI18n.t('app.all_posts_comments_and_other_community_contribut_6aae3bc1')}{" "}
                <Link to="/community-guidelines" className="text-primary hover:underline">{uiI18n.t('app.community_guidelines_75343669')}</Link>{uiI18n.t('app.before_your_first_post_or_comment_you_will_be_as_46bfe357')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.6_privacy_and_data_collection_45d15202')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.we_collect_minimal_personal_information_necessar_45aeb979')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.email_address_and_display_name_if_you_create_an__2519bf27')}</li>
                <li>{uiI18n.t('app.watch_history_and_preferences_stored_locally_and_033f397b')}</li>
                <li>{uiI18n.t('app.comments_and_ratings_you_submit_5051a6d7')}</li>
              </ul>
              <p>
                {uiI18n.t('app.we_do_not_sell_trade_or_share_your_personal_info_67ff9fe6')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.7_disclaimer_7edaa1a1')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.the_materials_on_tatakai_are_provided_as_is_tata_11f2a998')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.8_limitations_e2523a04')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.in_no_event_shall_tatakai_or_its_suppliers_be_li_ff2dd3d3')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.9_revisions_a030b591')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.tatakai_may_revise_these_terms_of_service_at_any_d3c74e45')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.10_contact_information_15618c48')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.if_you_have_any_questions_about_these_terms_and__477b97e7')}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
