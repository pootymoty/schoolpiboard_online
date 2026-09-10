using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Роль учётной записи.
///
/// Значение по умолчанию обязательно: колонка добавляется к живым
/// строкам, и без него они остались бы с пустой ролью, которую пришлось
/// бы проверять на каждом шаге.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260910180000_UserRole")]
public partial class UserRole : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "role",
            table: "users",
            type: "text",
            nullable: false,
            defaultValue: "user");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "role", table: "users");
    }
}
