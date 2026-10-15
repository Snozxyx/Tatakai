import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';

export default function PrivacyPage() {
  useUiTranslation();
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
              {uiI18n.t('app.back_b52b36b7')}
            </Button>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {uiI18n.t('app.privacy_policy_9db108ba')}
            </h1>
            <p className="text-muted-foreground">{uiI18n.t('app.last_updated_september_28_2026_13b452ee')}</p>
          </div>

          {/* Content */}
          <GlassPanel className="p-6 md:p-8 space-y-6">
            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.1_information_we_collect_d181b8ba')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.we_collect_information_you_provide_directly_to_u_96e09884')}
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>{uiI18n.t('app.email_address_and_username_98c7e185')}</li>
                <li>{uiI18n.t('app.profile_information_display_name_avatar_bio_cd03bd35')}</li>
                <li>{uiI18n.t('app.watchlist_and_viewing_history_f9052b00')}</li>
                <li>{uiI18n.t('app.comments_forum_posts_and_tier_lists_you_create_94f7ac52')}</li>
                <li>{uiI18n.t('app.communications_with_support_or_other_users_94c7853c')}</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.2_how_we_use_your_information_5f78897b')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.we_use_the_information_we_collect_to_f9037963')}
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>{uiI18n.t('app.provide_maintain_and_improve_our_services_9002dc97')}</li>
                <li>{uiI18n.t('app.personalize_your_experience_and_content_recommen_c8cbd614')}</li>
                <li>{uiI18n.t('app.send_you_technical_notices_and_support_messages_478bf984')}</li>
                <li>{uiI18n.t('app.respond_to_your_comments_and_questions_54883d22')}</li>
                <li>{uiI18n.t('app.monitor_and_analyze_trends_usage_and_activities_d522f1a4')}</li>
                <li>{uiI18n.t('app.detect_prevent_and_address_technical_issues_and__db30fb6b')}</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.3_information_sharing_bf702fa9')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.we_do_not_sell_your_personal_information_we_may__9479788a')}
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>{uiI18n.t('app.public_information_732d4b9b')}</strong> {uiI18n.t('app.profile_information_comments_and_posts_you_choos_8707c960')}</li>
                <li><strong>{uiI18n.t('app.service_providers_36260590')}</strong> {uiI18n.t('app.third_party_services_that_help_us_operate_authen_4f84b415')}</li>
                <li><strong>{uiI18n.t('app.legal_requirements_554568a2')}</strong> {uiI18n.t('app.when_required_by_law_or_to_protect_rights_and_sa_c144c13f')}</li>
                <li><strong>{uiI18n.t('app.business_transfers_de6e2955')}</strong> {uiI18n.t('app.in_connection_with_mergers_acquisitions_or_asset_6c5e8d46')}</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.4_data_security_e8fa1808')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.we_implement_appropriate_technical_and_organizat_e01c42d1')}
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>{uiI18n.t('app.encrypted_data_transmission_https_tls_81555558')}</li>
                <li>{uiI18n.t('app.secure_authentication_47994bd9')} </li>
                <li>{uiI18n.t('app.regular_security_audits_and_updates_7c9c9d4c')}</li>
                <li>{uiI18n.t('app.access_controls_and_monitoring_e68068a3')}</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.5_your_rights_and_choices_e218c289')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.you_have_the_following_rights_regarding_your_per_1a723230')}
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>{uiI18n.t('app.access_b8cf58c2')}</strong> {uiI18n.t('app.request_a_copy_of_your_personal_data_2ad86752')}</li>
                <li><strong>{uiI18n.t('app.correction_f3323f28')}</strong> {uiI18n.t('app.update_or_correct_your_information_through_profi_8dee68e8')}</li>
                <li><strong>{uiI18n.t('app.deletion_784b0846')}</strong> {uiI18n.t('app.request_deletion_of_your_account_and_associated__adc526c7')}</li>
                <li><strong>{uiI18n.t('app.opt_out_7cf56e46')}</strong> {uiI18n.t('app.unsubscribe_from_marketing_communications_924808d6')}</li>
                <li><strong>{uiI18n.t('app.export_11d8a56c')}</strong> {uiI18n.t('app.download_your_data_in_a_portable_format_50fbc764')}</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.6_cookies_and_tracking_b6851f28')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.we_use_cookies_and_similar_tracking_technologies_1401d12b')}
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>{uiI18n.t('app.maintain_your_session_and_remember_your_preferen_2e612973')}</li>
                <li>{uiI18n.t('app.understand_how_you_use_our_services_ba71b5fc')}</li>
                <li>{uiI18n.t('app.improve_our_website_performance_and_user_experie_a037e805')}</li>
                <li>{uiI18n.t('app.provide_personalized_content_and_recommendations_a9f40392')}</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                {uiI18n.t('app.you_can_control_cookies_through_your_browser_set_b6883f13')}
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.7_third_party_services_ea743e7c')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.our_service_integrates_with_third_party_provider_53e510f0')}
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>{uiI18n.t('app.external_apis_f96ff45f')}</strong> {uiI18n.t('app.anime_data_and_images_2cc35af7')}</li>
                <li><strong>{uiI18n.t('app.external_services_90af0df4')}</strong> {uiI18n.t('app.video_streaming_and_playback_1659819e')}</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                {uiI18n.t('app.these_services_have_their_own_privacy_policies_w_a5c206cc')}
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.8_children_s_privacy_70e03244')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.our_service_is_not_directed_to_children_under_13_c311066e')}
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.9_changes_to_this_policy_91239877')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.we_may_update_this_privacy_policy_from_time_to_t_ede560a7')}
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-display font-semibold text-primary">{uiI18n.t('app.10_contact_us_507dd7c1')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {uiI18n.t('app.if_you_have_any_questions_about_this_privacy_pol_2f9b7c35')}
              </p>
              <div className="bg-muted/30 rounded-lg p-4 mt-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>{uiI18n.t('app.email_4c4e6b2d')}</strong> privacy@tatakai.me
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>{uiI18n.t('app.discord_9b150cc8')}</strong> {uiI18n.t('app.join_our_community_server_1b51beb0')}
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>{uiI18n.t('app.response_time_ffcf7495')}</strong> {uiI18n.t('app.we_aim_to_respond_within_48_hours_fa1fc315')}
                </p>
              </div>
            </section>

            <div className="border-t border-border pt-6 mt-8">
              <p className="text-sm text-muted-foreground text-center">
                {uiI18n.t('app.by_using_tatakai_you_agree_to_this_privacy_polic_59cea2de')}{' '}
                <Link to="/terms" className="text-primary hover:underline">{uiI18n.t('app.terms_of_service_0c8a9a95')}</Link>{uiI18n.t('app.and_8278d2ad')}{' '}
                <Link to="/community-guidelines" className="text-primary hover:underline">{uiI18n.t('app.community_guidelines_75343669')}</Link>.
              </p>
            </div>
          </GlassPanel>
        </div>
      </main>
    </>
  );
}
