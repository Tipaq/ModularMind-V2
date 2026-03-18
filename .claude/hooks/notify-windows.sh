#!/bin/bash
# Notification hook: send a Windows toast notification when Claude needs attention

powershell.exe -Command "
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > \$null
  \$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText01)
  \$text = \$template.GetElementsByTagName('text')
  \$text.Item(0).AppendChild(\$template.CreateTextNode('Claude Code needs your attention')) > \$null
  \$toast = [Windows.UI.Notifications.ToastNotification]::new(\$template)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show(\$toast)
" 2>/dev/null

exit 0
