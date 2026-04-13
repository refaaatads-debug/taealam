<?php
// بيانات الاتصال بـ Supabase التي استخرجناها سابقاً
$host = "db.tujscqqosagwdugqgdkq.supabase.co"; // تأكد من الكود الخاص بك
$db   = "postgres";
$user = "postgres";
$pass = "كلمة_مرور_قاعدة_البيانات_الخاصة_بك";

try {
    $dsn = "pgsql:host=$host;port=5432;dbname=$db;";
    $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

    if ($pdo) {
        echo "✅ مبروك! الـ Subdomain متصل الآن بنجاح بـ Supabase.  
";
        
        // اختبار سحب بيانات المواد (Subjects) التي استوردناها بنجاح
        $query = $pdo->query("SELECT name FROM public.subjects LIMIT 5");
        echo "<b>البيانات المستوردة (أول 5 مواد):</b><ul>";
        while ($row = $query->fetch()) {
            echo "<li>" . $row['name'] . "</li>";
        }
        echo "</ul>";
    }
} catch (PDOException $e) {
    echo "❌ فشل الاتصال: " . $e->getMessage();
}
?>
