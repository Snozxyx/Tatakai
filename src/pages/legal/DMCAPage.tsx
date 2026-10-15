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
                {uiI18n.t('app.important_educational_disclaimer_45153cb9')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-semibold">
                {uiI18n.t('app.this_entire_project_is_created_strictly_for_educ_c7df2967')}
              </p>
              <p>
                {uiI18n.t('app.tatakai_is_a_frontend_demonstration_project_show_244be504')}
              </p>
              <div className="p-4 rounded-lg bg-background/50 border border-border">
                <p className="font-medium mb-2">{uiI18n.t('app.key_points_0c5cc172')}</p>
                <ul className="list-disc list-inside space-y-2 ml-4 text-sm">
                  <li>{uiI18n.t('app.we_do_not_host_any_anime_content_on_our_servers_703423d2')}</li>
                  <li>{uiI18n.t('app.we_do_not_own_any_of_the_anime_content_displayed_8bbf1367')}</li>
                  <li>{uiI18n.t('app.all_content_is_sourced_from_third_party_platform_797a80aa')}</li>
                  <li>{uiI18n.t('app.we_are_merely_a_frontend_interface_demonstrating_e6c32074')}</li>
                  <li>{uiI18n.t('app.this_is_a_non_commercial_educational_project_0787ef22')}</li>
                </ul>
              </div>
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
                {uiI18n.t('app.all_anime_content_videos_images_and_related_mate_e28c87ca')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.sourced_from_third_party_platforms_and_apis_1bb644fb')}</li>
                <li>{uiI18n.t('app.property_of_their_respective_copyright_holders_980ee9da')}</li>
                <li>{uiI18n.t('app.not_hosted_or_stored_on_our_servers_cc278f8d')}</li>
                <li>{uiI18n.t('app.displayed_for_educational_and_demonstration_purp_f03e7613')}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.how_we_aggregate_content_ef6f8def')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.tatakai_functions_as_a_frontend_aggregator_that_bd7ec4ed')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.uses_public_apis_from_services_like_hianime_jika_b670678c')}</li>
                <li>{uiI18n.t('app.scrapes_publicly_available_data_from_various_ani_3c3b1878')}</li>
                <li>{uiI18n.t('app.embeds_video_players_from_external_sources_307cdc57')}</li>
                <li>{uiI18n.t('app.acts_as_a_search_and_discovery_interface_5b36c5dd')}</li>
              </ul>
              <p className="mt-4">
                {uiI18n.t('app.we_do_not_50435689')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.upload_anime_episodes_or_movies_to_our_servers_13e00ef5')}</li>
                <li>{uiI18n.t('app.store_video_files_or_copyrighted_content_727de3d9')}</li>
                <li>{uiI18n.t('app.claim_ownership_of_any_anime_content_0ba91373')}</li>
                <li>{uiI18n.t('app.monetize_copyrighted_content_56a9a413')}</li>
                <li>{uiI18n.t('app.bypass_any_drm_or_content_protection_systems_89ebf019')}</li>
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
                <li>{uiI18n.t('app.we_can_only_remove_links_to_external_content_as__49c0b18b')}</li>
                <li>{uiI18n.t('app.for_content_removal_you_should_contact_the_origi_5dee88cf')}</li>
                <li>{uiI18n.t('app.we_will_cooperate_fully_with_valid_dmca_requests_86d0e0a2')}</li>
              </ul>
              
              <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
                <h3 className="font-semibold mb-3">{uiI18n.t('app.dmca_notice_requirements_26f32f91')}</h3>
                <p className="text-sm mb-2">{uiI18n.t('app.your_notice_must_include_330f7a49')}</p>
                <ol className="list-decimal list-inside space-y-2 ml-4 text-sm">
                  <li>{uiI18n.t('app.a_physical_or_electronic_signature_of_the_copyri_d8d5a70b')}</li>
                  <li>{uiI18n.t('app.identification_of_the_copyrighted_work_claimed_t_56df4786')}</li>
                  <li>{uiI18n.t('app.identification_of_the_material_that_is_claimed_t_a30fe994')}</li>
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
                    {uiI18n.t('app.please_submit_dmca_notices_through_our_suggestio_481bfae3')}
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
                {uiI18n.t('app.we_operate_in_good_faith_as_an_educational_proje_57055219')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.we_will_promptly_investigate_the_claim_4f99629c')}</li>
                <li>{uiI18n.t('app.we_will_remove_links_to_infringing_content_upon__bfa435e2')}</li>
                <li>{uiI18n.t('app.we_encourage_rights_holders_to_contact_the_origi_5349be53')}</li>
                <li>{uiI18n.t('app.we_maintain_no_copies_of_copyrighted_video_conte_dfc40a2b')}</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>{uiI18n.t('app.support_legal_anime_streaming_8499b936')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {uiI18n.t('app.we_encourage_all_users_to_support_the_anime_indu_86294c8c')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{uiI18n.t('app.crunchyroll_e4d70dc3')}</li>
                <li>{uiI18n.t('app.funimation_f7842b20')}</li>
                <li>{uiI18n.t('app.netflix_ca024fd6')}</li>
                <li>{uiI18n.t('app.hulu_3bf0b369')}</li>
                <li>{uiI18n.t('app.amazon_prime_video_6d89b22f')}</li>
                <li>{uiI18n.t('app.hidive_59d73dee')}</li>
              </ul>
              <p className="mt-4">
                {uiI18n.t('app.these_services_directly_support_anime_creators_s_c1bf3fb7')}
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
