using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Только данные, схема не меняется: у подписок учётных записей, удалённых
/// до этой правки, выключается автопродление. Раньше удаление его не
/// трогало, и такие подписки оставались «к продлению»: сервис предупреждал
/// о списании письмом на обезличенный адрес и просил бы списать деньги.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20261106120000_DisableRenewalForDeleted")]
public partial class DisableRenewalForDeleted : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE subscriptions
            SET auto_renew = FALSE
            WHERE auto_renew
              AND user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Возвращать нечего: какие подписки были с автопродлением, не записано,
        // а включать его удалённым обратно нельзя.
    }
}
