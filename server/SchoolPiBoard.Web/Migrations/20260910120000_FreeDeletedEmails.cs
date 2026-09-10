using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Освобождает почту уже удалённых учётных записей.
///
/// Удаление было мягким: строка оставалась в базе ради досок, на которых
/// работают другие, — и вместе с ней навсегда оставался занят адрес.
/// Человек, удаливший запись, не мог завести новую на ту же почту.
///
/// Схему миграция не меняет, только данные: тем, кто удалился до этой
/// правки, адрес освобождается задним числом.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260910120000_FreeDeletedEmails")]
public partial class FreeDeletedEmails : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"
            UPDATE users
            SET email = 'deleted-' || id || '@deleted.invalid'
            WHERE deleted_at IS NOT NULL
              AND email <> 'deleted-' || id || '@deleted.invalid';
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Обратно не восстановить: прежние адреса не сохранялись — в этом
        // и смысл удаления.
    }
}
