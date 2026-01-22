# Admin Features

This guide covers all administrative features and capabilities in Tatakai.

## Admin Access

### Setting Up Admins

#### Via SQL (Recommended)
```sql
-- Make a user admin by email
UPDATE public.profiles 
SET is_admin = true 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin@example.com'
);

-- Make a user admin by user_id
UPDATE public.profiles 
SET is_admin = true 
WHERE user_id = '12345678-1234-1234-1234-123456789abc';
```

#### Via Supabase Dashboard
1. Go to **Table Editor** → **profiles**
2. Find the user row
3. Set `is_admin` column to `true`
4. Save changes

### Verifying Admin Status
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('is_admin')
  .eq('user_id', userId)
  .single();

if (profile?.is_admin) {
  // User is admin
}
```

## Admin Dashboard

Access at `/admin` route. Only visible to administrators.

### Analytics Overview

The dashboard displays:
- **Total Users**: Count of registered users
- **Active Users**: Users active in last 30 days
- **Total Comments**: All comments across platform
- **Total Ratings**: All ratings submitted
- **System Status**: Maintenance mode indicator

### User Management

#### View All Users
```typescript
const { data: users } = await supabase
  .from('profiles')
  .select(`
    *,
    auth_users:user_id (
      email,
      created_at,
      last_sign_in_at
    )
  `)
  .order('created_at', { ascending: false });
```

#### Ban User
```typescript
const banUser = async (userId: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: true })
    .eq('user_id', userId);
    
  if (!error) {
    console.log('User banned successfully');
  }
};
```

**Effect of Ban:**
- User is redirected to `/banned` page on next navigation
- Cannot access any protected routes
- Cannot post comments or ratings
- Watch history still tracked (but not visible)

#### Unban User
```typescript
const unbanUser = async (userId: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: false })
    .eq('user_id', userId);
};
```

#### Promote to Admin
```typescript
const promoteToAdmin = async (userId: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_admin: true })
    .eq('user_id', userId);
};
```

#### Demote from Admin
```typescript
const demoteFromAdmin = async (userId: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_admin: false })
    .eq('user_id', userId);
};
```

## Maintenance Mode

Control system-wide maintenance status.

### Enable Maintenance Mode
```typescript
const enableMaintenance = async (message: string) => {
  const { error } = await supabase
    .from('maintenance_mode')
    .update({
      is_enabled: true,
      message: message,
      updated_at: new Date().toISOString(),
      updated_by: adminUserId
    })
    .eq('id', 1);
};
```

### Disable Maintenance Mode
```typescript
const disableMaintenance = async () => {
  const { error } = await supabase
    .from('maintenance_mode')
    .update({
      is_enabled: false,
      message: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1);
};
```

### Check Maintenance Status
```typescript
const { data } = await supabase
  .from('maintenance_mode')
  .select('*')
  .eq('id', 1)
  .single();

if (data?.is_enabled && !isAdmin) {
  // Redirect to maintenance page
  navigate('/maintenance');
}
```

**Admin Bypass:**
- Admins can always access the site
- Maintenance page shows admin controls
- Admins can disable maintenance from maintenance page

## Admin Messaging System

Send messages to users individually or broadcast to everyone.

### Send Broadcast Message
```typescript
const sendBroadcast = async (message: string) => {
  const { error } = await supabase
    .from('admin_messages')
    .insert({
      from_admin_id: adminUserId,
      message: message,
      is_broadcast: true,
      to_user_id: null
    });
};
```

### Send Individual Message
```typescript
const sendMessage = async (userId: string, message: string) => {
  const { error } = await supabase
    .from('admin_messages')
    .insert({
      from_admin_id: adminUserId,
      to_user_id: userId,
      message: message,
      is_broadcast: false
    });
};
```

### User Receiving Messages
```typescript
const { data: messages } = await supabase
  .from('admin_messages')
  .select(`
    *,
    admin:from_admin_id (
      username,
      avatar_url
    )
  `)
  .or(`to_user_id.eq.${userId},is_broadcast.eq.true`)
  .eq('is_read', false)
  .order('created_at', { ascending: false });
```

### Mark Message as Read
```typescript
const markAsRead = async (messageId: string) => {
  const { error } = await supabase
    .from('admin_messages')
    .update({ is_read: true })
    .eq('id', messageId)
    .eq('to_user_id', userId);
};
```

## Comment Moderation

Admins can delete any comment, not just their own.

### View All Comments
```typescript
const { data: comments } = await supabase
  .from('comments')
  .select(`
    *,
    profile:user_id (
      username,
      avatar_url,
      is_banned
    )
  `)
  .order('created_at', { ascending: false });
```

### Delete Comment
```typescript
const deleteComment = async (commentId: string) => {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId);
};
```

### Bulk Delete User Comments
```typescript
const deleteUserComments = async (userId: string) => {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('user_id', userId);
};
```

## View Statistics

Track anime popularity and user engagement.

### Get Top Viewed Anime
```typescript
const { data: topViewed } = await supabase
  .from('views')
  .select('*')
  .order('view_count', { ascending: false })
  .limit(10);
```

### Get User Activity Stats
```typescript
// Comments per user
const { data: userComments } = await supabase
  .from('comments')
  .select('user_id')
  .then(data => {
    const counts = {};
    data.forEach(c => {
      counts[c.user_id] = (counts[c.user_id] || 0) + 1;
    });
    return counts;
  });

// Ratings per user
const { data: userRatings } = await supabase
  .from('ratings')
  .select('user_id')
  .then(data => {
    const counts = {};
    data.forEach(r => {
      counts[r.user_id] = (counts[r.user_id] || 0) + 1;
    });
    return counts;
  });
```

## Admin Routes

### Protected Admin Routes
```typescript
// In router configuration
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { profile } = useAuth();
  
  if (!profile?.is_admin) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

// Usage
<Route
  path="/admin"
  element={
    <AdminRoute>
      <AdminPage />
    </AdminRoute>
  }
/>
```

### Admin Navigation
```typescript
{profile?.is_admin && (
  <Link to="/admin">
    <Button variant="ghost">
      <Shield className="mr-2 h-4 w-4" />
      Admin Dashboard
    </Button>
  </Link>
)}
```

## Security Considerations

### Row Level Security

All admin operations are protected by RLS policies:

```sql
-- Only admins can update user profiles
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

-- Only admins can delete any comment
CREATE POLICY "Admins can delete any comment"
  ON comments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );
```

### Admin Action Logging

Consider implementing audit logs:

```sql
CREATE TABLE admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log admin actions
INSERT INTO admin_actions (admin_id, action, target_user_id, details)
VALUES (
  current_user_id,
  'ban_user',
  target_user_id,
  '{"reason": "violation of terms"}'::jsonb
);
```

## Best Practices

### 1. Minimal Admin Count
- Keep number of admins small
- Only promote trusted users
- Regular audit of admin list

### 2. Clear Communication
- Always provide reason for bans
- Use maintenance messages effectively
- Respond to user inquiries promptly

### 3. Documentation
- Document admin actions
- Keep logs of significant changes
- Review admin activity regularly

### 4. Gradual Actions
- Warn users before banning
- Temporary bans before permanent
- Clear escalation policy

### 5. Backup Before Changes
- Backup database before bulk operations
- Test admin features in staging
- Have rollback plan ready

## Admin Checklist

### Daily Tasks
- [ ] Review new user signups
- [ ] Check reported comments
- [ ] Monitor system performance
- [ ] Respond to admin messages

### Weekly Tasks
- [ ] Review user statistics
- [ ] Check for abuse patterns
- [ ] Update maintenance schedules
- [ ] Backup database

### Monthly Tasks
- [ ] Audit admin accounts
- [ ] Review banned users
- [ ] Analyze platform metrics
- [ ] Plan feature updates

## Troubleshooting

### Admin Access Issues

**Problem:** Can't access admin dashboard
```typescript
// Verify admin status
const { data } = await supabase
  .from('profiles')
  .select('is_admin')
  .eq('user_id', userId)
  .single();

console.log('Is admin:', data?.is_admin);
```

**Solution:** Ensure `is_admin` is `true` in database

### RLS Policy Errors

**Problem:** "permission denied for table"
```sql
-- Check if RLS policies exist
SELECT * FROM pg_policies 
WHERE tablename = 'profiles';

-- Verify admin policy
SELECT * FROM pg_policies 
WHERE tablename = 'profiles' 
AND policyname LIKE '%admin%';
```

### Maintenance Mode Not Working

**Problem:** Non-admins can still access site
- Check maintenance_mode table has row with id=1
- Verify is_enabled is true
- Check frontend maintenance check logic
- Clear browser cache

## Future Admin Features

Planned enhancements:
- [ ] Advanced analytics dashboard
- [ ] User activity timeline
- [ ] Automated moderation
- [ ] Custom user roles
- [ ] Admin activity logs
- [ ] Scheduled maintenance
- [ ] Bulk user operations
- [ ] Email notifications
